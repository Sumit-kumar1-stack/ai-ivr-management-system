import { createCallLogger } from "@/lib/logger";
import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import { getCall } from "@/services/calls/call.service";
import { ConversationService } from "@/services/conversations/conversation.service";
import { endProviderCall } from "@/services/telephony/end-call.service";
import { handleIVRGraphExecutionResult } from "@/services/ivr/ivr-execution-result-handler.service";
import {
  routeDtmfThroughIVR,
  routeMainMenuThroughIVR,
  routeToIVRNode,
  routeVoiceThroughIVR,
  type HybridVoiceRouteResult,
} from "@/services/ivr/ivr-hybrid-router.service";
import { normalizeNavigationConfig } from "@/services/ivr/ivr-runtime-menu.service";
import { IVRFlowSessionService } from "@/services/ivr/ivr-flow-session.service";
import { orchestrateHumanTransfer } from "@/services/telephony/human-transfer-orchestrator.service";
import { VoiceWorker } from "@/services/voice/voice-worker.service";
import { routeLiveTurn, type LiveTurnRouteResult } from "./live-turn-router.service";

export type RealtimeTelephonyProvider = "TWILIO" | "PLIVO" | "EXOTEL" | "MOCK";

export type RealtimeCallInput =
  | { type: "VOICE"; callId: string; provider: RealtimeTelephonyProvider; text: string; isFinal: boolean; confidence?: number; timestamp: number }
  | { type: "DTMF"; callId: string; provider: RealtimeTelephonyProvider; digit: string; timestamp: number }
  | { type: "SILENCE"; callId: string; provider: RealtimeTelephonyProvider; durationMs: number; timestamp: number }
  | { type: "SYSTEM"; callId: string; event: "AGENT_REQUEST" | "REPEAT" | "MAIN_MENU" | "END_CALL"; timestamp: number };

export interface ResolvedInputIntent {
  intent: string;
  source: "VOICE" | "DTMF" | "SYSTEM" | "SILENCE";
  confidence: number;
  targetNodeId?: string | null;
  originalInput?: string;
}

export interface RealtimeInputRouteResult {
  handled: boolean;
  intent: ResolvedInputIntent | null;
  graphExecution: HybridVoiceRouteResult["graphExecution"];
  liveRoute?: LiveTurnRouteResult;
  speechText: string | null;
  endCall: boolean;
  reason: string;
}

export interface RealtimeInputRouteOptions {
  /** WebSocket adapters deliver audio themselves; legacy XML input routes do not. */
  deliverOutput?: boolean;
  /** Preserve the legacy DTMF path's no-duplicate-message behavior. */
  recordConversationMessage?: boolean;
  turnId?: number;
}

type ShortcutAction = "HUMAN_AGENT" | "REPEAT_LAST_RESPONSE" | "MAIN_MENU" | "END_CALL";
type FlowNode = { id: string; data?: Record<string, unknown> };

const defaultShortcuts: Record<string, ShortcutAction> = {
  "0": "HUMAN_AGENT",
  "9": "REPEAT_LAST_RESPONSE",
  "*": "MAIN_MENU",
  "#": "END_CALL",
};

/**
 * The provider-neutral input bus. Provider adapters authenticate and normalize
 * their events before calling this service; this service never trusts a
 * provider call identifier supplied by an arbitrary client.
 */
export async function routeRealtimeCallInput(
  input: RealtimeCallInput,
  options: RealtimeInputRouteOptions = {}
): Promise<RealtimeInputRouteResult> {
  const callId = input.callId.trim();
  if (!callId) return ignored("INVALID_CALL_ID");

  if (input.type === "SILENCE") {
    const graphRoute = await routeDtmfThroughIVR(callId, "");
    await deliverGraphResult(callId, graphRoute, options);
    return fromGraph(graphRoute, "SILENCE", "");
  }

  if (input.type === "VOICE") {
    if (!input.isFinal || !input.text.trim()) return ignored("VOICE_PARTIAL");

    const session = await IVRFlowSessionService.get(callId);
    const normalizedInput = input.text.trim().toLowerCase();
    if (
      session?.lastValue &&
      session.lastValue.trim().toLowerCase() === normalizedInput &&
      session.lastTriggeredAt &&
      Date.now() - session.lastTriggeredAt < 3000
    ) {
      return ignored("DUPLICATE_VOICE_TURN");
    }

    const graphRoute = await routeVoiceThroughIVR(callId, input.text, options.turnId);
    if (graphRoute.graphExecution && graphRoute.matched) {
      await deliverGraphResult(callId, graphRoute, options);
      return fromGraph(graphRoute, "VOICE", input.text);
    }
    const context = await getActiveFlowContext(callId);
    const globalCommand = globalVoiceCommand(input.text, context ?? undefined);
    if (globalCommand) return routeSystemInput(callId, globalCommand, options);
    if (graphRoute.graphExecution) {
      await deliverGraphResult(callId, graphRoute, options);
      return fromGraph(graphRoute, "VOICE", input.text);
    }
    const liveRoute = await routeLiveTurn(callId, input.text, undefined, options.turnId);
    return {
      handled: liveRoute.handled,
      intent: liveRoute.outcome
        ? { intent: liveRoute.outcome.intent, source: "VOICE", confidence: liveRoute.outcome.confidence, originalInput: input.text }
        : null,
      graphExecution: null,
      liveRoute,
      speechText: liveRoute.response,
      endCall: false,
      reason: liveRoute.handled ? "LIVE_TURN" : "VOICE_UNHANDLED",
    };
  }

  if (input.type === "SYSTEM") {
    return routeSystemInput(callId, input.event, options);
  }

  const digit = normalizeDigit(input.digit);
  if (!digit) return ignored("INVALID_DTMF");

  const context = await getActiveFlowContext(callId);
  if (!context) return ignored("NO_ACTIVE_PUBLISHED_FLOW");
  if (context.inputMode === "VOICE") return ignored("DTMF_DISABLED");

  const shortcut = shortcutForDigit(digit, context);
  if (shortcut) {
    return routeShortcut(callId, shortcut, digit, context, options);
  }

  const optionAction = actionForMenuDigit(digit, context.currentNode.data);
  if (optionAction) {
    return routeShortcut(callId, optionAction, digit, context, options);
  }

  const graphRoute = await routeDtmfThroughIVR(callId, digit);
  await deliverGraphResult(callId, graphRoute, options);
  return fromGraph(graphRoute, "DTMF", digit);
}

function globalVoiceCommand(text: string, context?: ActiveFlowContext): Extract<RealtimeCallInput, { type: "SYSTEM" }>['event'] | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?]/g, "");
  if (context) {
    const navConfig = normalizeNavigationConfig(context.currentNode.data) ?? normalizeNavigationConfig(context.start.data);
    if (navConfig) {
      if (navConfig.home.enabled && navConfig.home.phrases.some(p => p === normalized || normalized.includes(p))) return "MAIN_MENU";
      if (navConfig.repeat.enabled && navConfig.repeat.phrases.some(p => p === normalized || normalized.includes(p))) return "REPEAT";
      if (navConfig.end.enabled && navConfig.end.phrases.some(p => p === normalized || normalized.includes(p))) return "END_CALL";
    }
  }
  if (["agent", "human", "talk to a person", "talk to an agent", "talk to an agent please", "customer care", "representative", "talk to a representative"].includes(normalized)) return "AGENT_REQUEST";
  if (["repeat", "repeat that", "say that again"].includes(normalized)) return "REPEAT";
  if (["main menu", "go back"].includes(normalized)) return "MAIN_MENU";
  if (["end call", "goodbye"].includes(normalized)) return "END_CALL";
  return null;
}

async function routeSystemInput(
  callId: string,
  event: Extract<RealtimeCallInput, { type: "SYSTEM" }>["event"],
  options: RealtimeInputRouteOptions
): Promise<RealtimeInputRouteResult> {
  const context = await getActiveFlowContext(callId);
  if (!context) return ignored("NO_ACTIVE_PUBLISHED_FLOW");
  const systemActions: Record<Extract<RealtimeCallInput, { type: "SYSTEM" }>["event"], ShortcutAction> = {
    AGENT_REQUEST: "HUMAN_AGENT",
    REPEAT: "REPEAT_LAST_RESPONSE",
    MAIN_MENU: "MAIN_MENU",
    END_CALL: "END_CALL",
  };
  const action = systemActions[event];
  return routeShortcut(callId, action, event, context, options);
}

async function routeShortcut(
  callId: string,
  action: ShortcutAction,
  value: string,
  context: ActiveFlowContext,
  options: RealtimeInputRouteOptions
): Promise<RealtimeInputRouteResult> {
  const log = createCallLogger(callId);
  const playbackCleared = typeof AudioSessionService.clearPlayback === "function"
    ? AudioSessionService.clearPlayback(callId)
    : false;
  log.info({ event: "input.shortcut.received", action, sourceValue: value, playbackCleared }, "Realtime input shortcut received");

  if (action === "HUMAN_AGENT") {
    const transferNode = configuredNode(context, "humanAgentNodeId", ["HUMAN_TRANSFER", "TRANSFER"]);
    if (transferNode) {
      const route = await routeToIVRNode(callId, transferNode, "HUMAN_AGENT", value);
      await deliverGraphResult(callId, route, options);
      return fromGraph(route, "SYSTEM", value, "HUMAN_AGENT");
    }
    const transfer = await orchestrateHumanTransfer(callId, "Caller requested a human agent using keypad");
    if (options.deliverOutput !== false && !transfer.transferred && transfer.message.trim()) {
      void VoiceWorker.start(callId);
      await VoiceWorker.addText(callId, transfer.message);
    }
    return {
      handled: true,
      intent: { intent: "HUMAN_AGENT", source: "SYSTEM", confidence: 1, originalInput: value },
      graphExecution: null,
      speechText: transfer.message,
      endCall: false,
      reason: transfer.transferred ? "TRANSFER_REQUESTED" : "TRANSFER_UNAVAILABLE",
    };
  }

  if (action === "REPEAT_LAST_RESPONSE") {
    const conversation = await ConversationService.getConversation(callId);
    const latest = [...(conversation?.messages ?? [])].reverse().find(message => message.role === "ASSISTANT" && message.content.trim());
    const speechText = latest?.content.trim() ?? "There is no previous response to repeat.";
    if (options.deliverOutput !== false && latest) {
      void VoiceWorker.start(callId);
      await VoiceWorker.addText(callId, speechText);
    }
    return {
      handled: Boolean(latest),
      intent: { intent: "REPEAT_LAST_RESPONSE", source: "SYSTEM", confidence: 1, originalInput: value },
      graphExecution: null,
      speechText,
      endCall: false,
      reason: latest ? "REPEATED_ASSISTANT_RESPONSE" : "NO_ASSISTANT_RESPONSE",
    };
  }

  if (action === "MAIN_MENU") {
    const route = await routeMainMenuThroughIVR(callId, configuredNode(context, "mainMenuNodeId"));
    await deliverGraphResult(callId, route, options);
    return fromGraph(route, "SYSTEM", value, "MAIN_MENU");
  }

  // A direct # press is an explicit call-end confirmation except while a
  // confirmation node is active, where the node retains control of input.
  if (String(context.currentNode.data?.nodeKind ?? "").toUpperCase() === "CONFIRMATION") {
    return ignored("END_CALL_DEFERRED_TO_CONFIRMATION");
  }

  const option = (
    Array.isArray(context.currentNode.data?.options)
      ? context.currentNode.data.options
      : Array.isArray(context.currentNode.data?.menuOptions)
        ? context.currentNode.data.menuOptions
        : []
  ).find(opt => isRecord(opt) && (opt.digit === value || opt.dtmf === value));

  const targetNodeId =
    (isRecord(option) && typeof option.destinationNodeId === "string" ? option.destinationNodeId : null) ??
    configuredNode(context, "endCallNodeId", ["END_CALL"]);

  if (targetNodeId) {
    const route = await routeToIVRNode(callId, targetNodeId, "END_CALL", value);
    await deliverGraphResult(callId, route, options);
    return fromGraph(route, "SYSTEM", value, "END_CALL");
  }

  const fallbackGoodbye = "Thank you for calling. Have a great day.";

  if (options.deliverOutput !== false) {
    void VoiceWorker.start(callId);
    await VoiceWorker.addText(callId, fallbackGoodbye);
    const result = await endProviderCall(callId);
    return {
      handled: result.success,
      intent: { intent: "END_CALL", source: "SYSTEM", confidence: 1, originalInput: value },
      graphExecution: null,
      speechText: result.success ? fallbackGoodbye : result.message,
      endCall: result.success,
      reason: result.code ?? "END_CALL_REQUESTED",
    };
  }

  return {
    handled: true,
    intent: { intent: "END_CALL", source: "SYSTEM", confidence: 1, originalInput: value },
    graphExecution: null,
    speechText: fallbackGoodbye,
    endCall: true,
    reason: "END_CALL_REQUESTED",
  };
}

async function deliverGraphResult(callId: string, route: HybridVoiceRouteResult, options: RealtimeInputRouteOptions): Promise<void> {
  if (options.deliverOutput === false || !route.graphExecution) return;
  await handleIVRGraphExecutionResult(callId, route.graphExecution, {
    turnId: options.turnId,
    recordConversationMessage: options.recordConversationMessage ?? false,
  });
  if (route.graphExecution.endCall) {
    await endProviderCall(callId);
  }
}

function fromGraph(
  route: HybridVoiceRouteResult,
  source: ResolvedInputIntent["source"],
  originalInput: string,
  intentOverride?: string
): RealtimeInputRouteResult {
  return {
    handled: route.matched,
    intent: route.matched
      ? { intent: intentOverride ?? route.action ?? "IVR_SELECTION", source, confidence: route.confidence, targetNodeId: route.graphExecution?.currentNodeId ?? null, originalInput }
      : null,
    graphExecution: route.graphExecution,
    speechText: route.graphExecution?.speechText ?? null,
    endCall: route.graphExecution?.endCall ?? false,
    reason: route.matched ? "IVR_GRAPH" : "UNMATCHED_DTMF",
  };
}

type ActiveFlowContext = {
  nodes: FlowNode[];
  start: FlowNode;
  currentNode: FlowNode;
  inputMode: "VOICE" | "DTMF" | "VOICE_AND_DTMF";
};

async function getActiveFlowContext(callId: string): Promise<ActiveFlowContext | null> {
  const [call, session] = await Promise.all([getCall(callId), IVRFlowSessionService.get(callId)]);
  if (!call?.ivrFlowVersion || !session?.currentNodeId || call.ivrFlowVersion.status !== "PUBLISHED") return null;
  const nodes = Array.isArray(call.ivrFlowVersion.nodes) ? call.ivrFlowVersion.nodes as FlowNode[] : [];
  const start = nodes.find(node => String(node.data?.nodeKind ?? "").toUpperCase() === "START");
  const currentNode = nodes.find(node => node.id === session.currentNodeId);
  if (!start || !currentNode) return null;
  return { nodes, start, currentNode, inputMode: inputMode(start.data?.inputMode ?? start.data?.runtimeInputMode) };
}

function shortcutForDigit(digit: string, context: ActiveFlowContext): ShortcutAction | null {
  if (overridesShortcut(digit, context.currentNode.data)) return null;

  const navConfig = normalizeNavigationConfig(context.currentNode.data) ?? normalizeNavigationConfig(context.start.data);
  if (navConfig) {
    if (navConfig.home.enabled && navConfig.home.digits.includes(digit)) return "MAIN_MENU";
    if (navConfig.back.enabled && navConfig.back.digits.includes(digit)) return "MAIN_MENU";
    if (navConfig.repeat.enabled && navConfig.repeat.digits.includes(digit)) return "REPEAT_LAST_RESPONSE";
    if (navConfig.end.enabled && navConfig.end.digits.includes(digit)) return "END_CALL";
    return null;
  }

  const configured = readShortcut(context.start.data, digit);
  return configured === false ? null : configured ?? defaultShortcuts[digit] ?? null;
}

function readShortcut(data: Record<string, unknown> | undefined, digit: string): ShortcutAction | false | null {
  const shortcuts = isRecord(data?.globalShortcuts) ? data.globalShortcuts : null;
  const value = shortcuts?.[digit];
  if (value === false || value === "DISABLED") return false;
  return value === "HUMAN_AGENT" || value === "REPEAT_LAST_RESPONSE" || value === "MAIN_MENU" || value === "END_CALL" ? value : null;
}

function overridesShortcut(digit: string, data: Record<string, unknown> | undefined): boolean {
  if (data?.disableGlobalShortcuts === true || data?.sensitiveConfirmationPending === true) return true;
  const overrideDigits = Array.isArray(data?.overrideGlobalShortcuts) ? data.overrideGlobalShortcuts : [];
  if (overrideDigits.includes(digit)) return true;
  const options = Array.isArray(data?.options) ? data.options : Array.isArray(data?.menuOptions) ? data.menuOptions : [];
  return options.some(option => isRecord(option) && (option.digit === digit || option.dtmf === digit));
}

function actionForMenuDigit(digit: string, data: Record<string, unknown> | undefined): ShortcutAction | null {
  const options = Array.isArray(data?.options) ? data.options : Array.isArray(data?.menuOptions) ? data.menuOptions : [];
  const action = options.find(option => isRecord(option) && (option.digit === digit || option.dtmf === digit))?.action;
  return action === "AGENT_REQUEST" || action === "HUMAN_AGENT"
    ? "HUMAN_AGENT"
    : action === "REPEAT_MENU"
      ? "REPEAT_LAST_RESPONSE"
      : action === "END_CALL"
        ? "END_CALL"
        : null;
}

function configuredNode(context: ActiveFlowContext, field: string, kinds: string[] = []): string | null {
  const value = context.start.data?.[field];
  if (typeof value === "string" && context.nodes.some(node => node.id === value.trim())) return value.trim();
  return context.nodes.find(node => kinds.includes(String(node.data?.nodeKind ?? "").toUpperCase()))?.id ?? null;
}

function inputMode(value: unknown): ActiveFlowContext["inputMode"] {
  return value === "VOICE" || value === "DTMF" || value === "VOICE_AND_DTMF" ? value : "VOICE_AND_DTMF";
}

function normalizeDigit(value: string): string | null {
  const digit = value.trim();
  return /^[0-9*#]$/.test(digit) ? digit : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ignored(reason: string): RealtimeInputRouteResult {
  return { handled: false, intent: null, graphExecution: null, speechText: null, endCall: false, reason };
}
