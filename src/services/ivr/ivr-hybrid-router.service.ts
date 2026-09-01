import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  CascadedTurnLatency,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

import {
  executeIVRGraphRoute,
} from "./ivr-graph-executor.service";

import {
  IVRFlowSessionService,
} from "./ivr-flow-session.service";

import {
  routeStandardInput,
} from "./standard-input-router.service";

import type {
  IVRGraphExecutionResult,
} from "./ivr-graph-executor.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface HybridVoiceRouteResult {
  matched:
    boolean;

  confidence:
    number;

  action:
    string | null;

  execution:
    IVRGraphExecutionResult | null;

  graphExecution:
    IVRGraphExecutionResult | null;

  continueConversation:
    boolean;
}

//--------------------------------------------------
// No Match
//--------------------------------------------------

function noMatch(
  confidence = 0
): HybridVoiceRouteResult {
  return {
    matched:
      false,

    confidence,

    action:
      null,

    execution:
      null,

    graphExecution:
      null,

    continueConversation:
      true,
  };
}

//--------------------------------------------------
// Route Spoken Input
//--------------------------------------------------

export async function routeVoiceThroughIVR(
  callId: string,
  transcript: string,
  _turnId?: number
): Promise<HybridVoiceRouteResult> {
  void _turnId;
  const log =
    createCallLogger(
      callId
    );

  try {
    //------------------------------------------------
    // Call
    //------------------------------------------------

    const call =
      await getCall(
        callId
      );

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "ivr.voice.route_skipped",

          reason:
            "call_not_found",
        },
        "Voice IVR routing skipped"
      );

      return noMatch();
    }

    const runtime = await IVRFlowSessionService.get(callId);

    if (
      !call.ivrFlowVersion ||
      !runtime?.currentNodeId ||
      !call.ivrFlowVersion.nodes
    ) {
      log.debug(
        {
          event: "ivr.voice.route_skipped",
          reason: "no_active_ivr_flow",
          campaignId: call.campaignId,
        },
        "No active IVR flow available for voice routing"
      );
      return noMatch();
    }

    const nodes = Array.isArray(call.ivrFlowVersion.nodes)
      ? call.ivrFlowVersion.nodes as Array<{ id: string; data?: Record<string, unknown> }>
      : [];
    const edges = Array.isArray(call.ivrFlowVersion.edges)
      ? call.ivrFlowVersion.edges as Array<{ source: string; target: string; data?: Record<string, unknown> }>
      : [];
    const currentNode = nodes.find(node => node.id === runtime.currentNodeId);

    if (!currentNode) {
      return noMatch();
    }

    const currentKind = String(currentNode.data?.nodeKind ?? "").toUpperCase();
    if (currentKind === "AI_CONVERSATION" || currentKind === "AI") {
      return noMatch();
    }

    const route = routeStandardInput({
      nodes,
      edges,
      currentNodeId: currentNode.id,
      inputMode: "VOICE",
      rawInput: transcript,
      previousNodeId: runtime.previousNodeId ?? undefined,
      navigationHistory: runtime.navigationHistory ?? undefined,
    });

    const execution = await executeIVRGraphRoute(callId, route, {
      mode: "VOICE",
      value: transcript,
    });

    log.info(
      {
        event: "ivr.voice.route_completed",
        campaignId: call.campaignId,
        matched: route.matched,
        confidence: route.confidence,
        currentNodeId: execution.currentNodeId,
        nextNodeId: execution.nextNodeId,
        endCall: execution.endCall,
        awaitInput: execution.awaitInput,
        transcriptCharacterCount: transcript.length,
      },
      "Voice input routed through shared IVR graph executor"
    );

    return {
      matched: route.matched,
      confidence: route.confidence,
      action: route.action,
      execution,
      graphExecution: execution,
      continueConversation: false,
    };
  } catch (
    error
  ) {
    CascadedTurnLatency.fail(
      callId,
      "ROUTING"
    );
    log.error(
      {
        event:
          "ivr.voice.routing_failed",

        transcriptCharacterCount:
          transcript.length,

        error:
          normalizeError(
            error
          ),
      },
      "Hybrid voice IVR routing failed"
    );

    /*
     * Failure of deterministic IVR routing must not
     * kill normal conversational AI.
     */
    return noMatch();
  }
}

/** Provider-neutral keypad entry point used by non-streaming voice adapters. */
export async function routeDtmfThroughIVR(
  callId: string,
  digit: string
): Promise<HybridVoiceRouteResult> {
  const call = await getCall(callId);
  const runtime = await IVRFlowSessionService.get(callId);
  if (!call?.ivrFlowVersion || !runtime?.currentNodeId) return noMatch();

  const nodes = Array.isArray(call.ivrFlowVersion.nodes)
    ? call.ivrFlowVersion.nodes as Array<{ id: string; data?: Record<string, unknown> }>
    : [];
  const edges = Array.isArray(call.ivrFlowVersion.edges)
    ? call.ivrFlowVersion.edges as Array<{ source: string; target: string; sourceHandle?: string | null; data?: Record<string, unknown> }>
    : [];
  const entryNodeId = runtime.currentNodeId;
  const route = routeStandardInput({
    nodes,
    edges,
    currentNodeId: runtime.currentNodeId,
    inputMode: "DTMF",
    rawInput: digit,
    previousNodeId: runtime.previousNodeId ?? undefined,
  });
  const execution = await executeIVRGraphRoute(callId, route, { mode: "DTMF", value: digit });
  if (route.matched) {
    await persistEntrySelection(callId, (await IVRFlowSessionService.get(callId)) ?? runtime, nodes, entryNodeId, digit, route.optionLabel);
  }
  return {
    matched: route.matched,
    confidence: route.confidence,
    action: route.action,
    execution,
    graphExecution: execution,
    continueConversation: false,
  };
}

async function persistEntrySelection(
  callId: string,
  runtime: NonNullable<Awaited<ReturnType<typeof IVRFlowSessionService.get>>>,
  nodes: Array<{ id: string; data?: Record<string, unknown> }>,
  entryNodeId: string,
  digit: string,
  optionLabel: string | null
): Promise<void> {
  const entryNode = nodes.find(node => node.id === entryNodeId);
  const options = Array.isArray(entryNode?.data?.options) ? entryNode.data.options : [];
  const option = options.find(value => value && typeof value === "object" && (value as Record<string, unknown>).digit === digit) as Record<string, unknown> | undefined;
  const selectedIntent = stringValue(option?.intent) ?? stringValue(option?.action) ?? optionLabel ?? runtime.selectedIntent ?? null;
  const selectedDepartment = stringValue(option?.department) ?? optionLabel ?? runtime.selectedDepartment ?? null;
  const preferredLanguage = stringValue(option?.language) ?? runtime.preferredLanguage ?? null;
  await IVRFlowSessionService.set(callId, {
    ...runtime,
    selectedDigit: digit,
    selectedIntent,
    selectedDepartment,
    preferredLanguage,
    collectedFields: { ...(runtime.collectedFields ?? {}), ...(selectedIntent ? { selectedIntent } : {}), ...(selectedDepartment ? { selectedDepartment } : {}) },
    conversationMode: "REALTIME_AI",
    inputStage: "REALTIME_AI",
  });
  createCallLogger(callId).info({ event: "ivr.intent.selected", currentNodeId: runtime.currentNodeId, selectedIntent, selectedDepartment, preferredLanguage }, "IVR entry selection persisted");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Moves an active published flow to an explicitly configured node.  Global
 * input commands use this rather than maintaining a second graph state store.
 */
export async function routeToIVRNode(
  callId: string,
  targetNodeId: string,
  transition: string,
  value: string
): Promise<HybridVoiceRouteResult> {
  const call = await getCall(callId);
  const runtime = await IVRFlowSessionService.get(callId);
  const nodes = Array.isArray(call?.ivrFlowVersion?.nodes)
    ? call.ivrFlowVersion.nodes as Array<{ id: string }>
    : [];

  if (!call?.ivrFlowVersion || !runtime?.currentNodeId || !nodes.some(node => node.id === targetNodeId)) {
    return noMatch();
  }

  const execution = await executeIVRGraphRoute(callId, {
    matched: true,
    confidence: 1,
    resultingNodeId: targetNodeId,
    transition,
    action: "NAVIGATE",
    optionLabel: null,
  }, { mode: "DTMF", value });

  return {
    matched: true,
    confidence: 1,
    action: "NAVIGATE",
    execution,
    graphExecution: execution,
    continueConversation: false,
  };
}

/** Returns to a configured main-menu node, falling back to the flow START. */
export async function routeMainMenuThroughIVR(
  callId: string,
  configuredNodeId?: string | null
): Promise<HybridVoiceRouteResult> {
  const call = await getCall(callId);
  const nodes = Array.isArray(call?.ivrFlowVersion?.nodes)
    ? call.ivrFlowVersion.nodes as Array<{ id: string; data?: Record<string, unknown> }>
    : [];
  const configured = configuredNodeId?.trim();
  const start = nodes.find(node => String(node.data?.nodeKind ?? "").toUpperCase() === "START");
  const startConfigured = typeof start?.data?.mainMenuNodeId === "string"
    ? start.data.mainMenuNodeId.trim()
    : "";
  const targetNodeId = [configured, startConfigured, start?.id].find(candidate =>
    Boolean(candidate) && nodes.some(node => node.id === candidate)
  );

  return targetNodeId
    ? routeToIVRNode(callId, targetNodeId, "MAIN_MENU", "*")
    : noMatch();
}
