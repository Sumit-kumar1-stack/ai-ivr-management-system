export type IVRMenuInputMode = "DTMF" | "SPEECH" | "BOTH";

export interface NormalizedIVRMenuOption {
  digit: string | null;
  label: string;
  aliases: string[];
  acknowledgement: string | null;
  destinationNodeId: string | null;
  action: string | null;
  intent: string | null;
  department: string | null;
  language: string | null;
}

export interface NormalizedNavigationActionConfig {
  enabled: boolean;
  digits: string[];
  phrases: string[];
  targetNodeId: string | null;
}

export interface NormalizedIVRNavigationConfig {
  home: NormalizedNavigationActionConfig;
  back: NormalizedNavigationActionConfig;
  repeat: NormalizedNavigationActionConfig;
  end: NormalizedNavigationActionConfig;
}

export interface NormalizedIVRRuntimeMenu {
  inputMode: IVRMenuInputMode;
  prompt: string;
  repeatPrompt: string;
  invalidPrompt: string;
  timeoutPrompt: string;
  exhaustedPrompt: string;
  maxAttempts: number;
  timeoutSeconds: number;
  options: NormalizedIVRMenuOption[];
}

type RuntimeMenuNode = {
  data?: Record<string, unknown>;
};

/**
 * Projects legacy and current saved menu shapes into the provider-neutral
 * presentation contract. Published graph data remains the source of truth;
 * the defaults below contain no tenant or business semantics.
 */
export function normalizeRuntimeMenu(
  node: RuntimeMenuNode
): NormalizedIVRRuntimeMenu | null {
  const data = node.data;
  const kind = stringValue(data?.nodeKind)?.toUpperCase();

  if (kind !== "DTMF_MENU" && kind !== "HYBRID_MENU") {
    return null;
  }

  const runtimeMenu = isRecord(data?.runtimeMenu) ? data.runtimeMenu : {};
  const inputMode = normalizeMenuInputMode(
    runtimeMenu.inputMode ?? data?.inputMode,
    kind === "DTMF_MENU" ? "DTMF" : "BOTH"
  );
  const options = sourceOptions(data, runtimeMenu).flatMap(normalizeOption);

  return {
    inputMode,
    prompt:
      stringValue(runtimeMenu.prompt) ??
      stringValue(data?.prompt) ??
      defaultMenuPrompt(inputMode),
    repeatPrompt:
      stringValue(runtimeMenu.repeatPrompt) ??
      "Here are the options again.",
    invalidPrompt:
      stringValue(runtimeMenu.invalidPrompt) ??
      defaultInvalidPrompt(inputMode),
    timeoutPrompt:
      stringValue(runtimeMenu.timeoutPrompt) ??
      defaultTimeoutPrompt(inputMode),
    exhaustedPrompt:
      stringValue(runtimeMenu.exhaustedPrompt) ??
      "Maximum attempts reached. Ending the call.",
    maxAttempts: boundedInteger(runtimeMenu.maxAttempts ?? data?.maxAttempts, 1, 5, 3),
    timeoutSeconds: boundedInteger(runtimeMenu.timeoutSeconds, 1, 60, 8),
    options,
  };
}

export function normalizeMenuInputMode(
  value: unknown,
  fallback: IVRMenuInputMode = "BOTH"
): IVRMenuInputMode {
  const normalized = stringValue(value)?.toUpperCase();

  if (normalized === "DTMF" || normalized === "KEYPAD") return "DTMF";
  if (normalized === "SPEECH" || normalized === "VOICE") return "SPEECH";
  if (
    normalized === "BOTH" ||
    normalized === "VOICE_AND_DTMF" ||
    normalized === "STAGED_HYBRID"
  ) {
    return "BOTH";
  }

  return fallback;
}

export function plivoInputTypeForMode(mode: IVRMenuInputMode): string {
  if (mode === "DTMF") return "dtmf";
  if (mode === "SPEECH") return "speech";
  return "dtmf speech";
}

function normalizeOption(value: unknown): NormalizedIVRMenuOption[] {
  if (!isRecord(value)) return [];

  const label = stringValue(value.label) ?? "";
  const configuredAliases = Array.isArray(value.voicePhrases)
    ? value.voicePhrases
    : Array.isArray(value.phrases)
      ? value.phrases
      : [];
  const aliases = uniqueStrings([
    label,
    ...configuredAliases.flatMap(alias => stringValue(alias) ?? []),
  ]);

  return [{
    digit: stringValue(value.digit) ?? stringValue(value.dtmf),
    label,
    aliases,
    acknowledgement: stringValue(value.response) ?? stringValue(value.acknowledgement),
    destinationNodeId:
      stringValue(value.destinationNodeId) ??
      stringValue(value.targetNodeId) ??
      stringValue(value.destination) ??
      stringValue(value.target),
    action: stringValue(value.action),
    intent: stringValue(value.intent),
    department: stringValue(value.department),
    language: stringValue(value.language),
  }];
}

function sourceOptions(
  data: Record<string, unknown> | undefined,
  runtimeMenu: Record<string, unknown>
): unknown[] {
  if (Array.isArray(data?.options)) return data.options;
  if (Array.isArray(data?.menuOptions)) return data.menuOptions;
  return Array.isArray(runtimeMenu.options) ? runtimeMenu.options : [];
}

function defaultMenuPrompt(mode: IVRMenuInputMode): string {
  if (mode === "DTMF") return "Please press one of the available options.";
  if (mode === "SPEECH") return "Please say one of the available options.";
  return "Please press or say one of the available options.";
}

function defaultInvalidPrompt(mode: IVRMenuInputMode): string {
  if (mode === "DTMF") return "That key is not available. Please try again.";
  return "I didn't recognize that option. Please try again.";
}

function defaultTimeoutPrompt(mode: IVRMenuInputMode): string {
  if (mode === "DTMF") return "I didn't receive a key. Please try again.";
  if (mode === "SPEECH") return "I didn't hear a response. Please try again.";
  return "I didn't receive a response. Please try again.";
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeNavigationConfig(
  flowOrNodeData: Record<string, unknown> | undefined
): NormalizedIVRNavigationConfig | null {
  if (!isRecord(flowOrNodeData)) return null;

  const nav = isRecord(flowOrNodeData.navigation) ? flowOrNodeData.navigation : null;
  if (!nav) return null;

  return {
    home: normalizeNavigationAction(
      nav.home,
      stringValue(flowOrNodeData.mainMenuNodeId) ?? stringValue(flowOrNodeData.homeNodeId)
    ),
    back: normalizeNavigationAction(nav.back),
    repeat: normalizeNavigationAction(nav.repeat),
    end: normalizeNavigationAction(nav.end),
  };
}

function normalizeNavigationAction(
  action: unknown,
  defaultTargetNodeId: string | null = null
): NormalizedNavigationActionConfig {
  if (!isRecord(action)) {
    return {
      enabled: false,
      digits: [],
      phrases: [],
      targetNodeId: defaultTargetNodeId,
    };
  }

  const enabled = action.enabled !== false;
  const rawDigits = Array.isArray(action.digits)
    ? action.digits
    : typeof action.digit === "string"
      ? [action.digit]
      : [];
  const rawPhrases = Array.isArray(action.phrases)
    ? action.phrases
    : Array.isArray(action.voicePhrases)
      ? action.voicePhrases
      : typeof action.phrase === "string"
        ? [action.phrase]
        : [];

  const digits = uniqueStrings(rawDigits.flatMap(d => (typeof d === "string" ? [d] : [])));
  const phrases = uniqueStrings(rawPhrases.flatMap(p => (typeof p === "string" ? [p] : [])));
  const targetNodeId = stringValue(action.targetNodeId) ?? defaultTargetNodeId;

  return {
    enabled,
    digits,
    phrases,
    targetNodeId,
  };
}

export type NormalizedPostActionMode =
  | "RETURN_HOME"
  | "RETURN_PREVIOUS"
  | "STAY_CURRENT"
  | "ASK_NEXT_ACTION"
  | "CONTINUE_TO_NODE"
  | "END_CALL";

export interface NormalizedIVRPostActionConfig {
  mode: NormalizedPostActionMode;
  targetNodeId: string | null;
  prompt: string | null;
}

export function normalizePostActionConfig(
  nodeData: Record<string, unknown> | undefined
): NormalizedIVRPostActionConfig | null {
  if (!isRecord(nodeData) || !isRecord(nodeData.postAction)) return null;

  const rawMode = stringValue(nodeData.postAction.mode)?.toUpperCase();
  const validModes: NormalizedPostActionMode[] = [
    "RETURN_HOME",
    "RETURN_PREVIOUS",
    "STAY_CURRENT",
    "ASK_NEXT_ACTION",
    "CONTINUE_TO_NODE",
    "END_CALL",
  ];

  if (!rawMode || !validModes.includes(rawMode as NormalizedPostActionMode)) {
    return null;
  }

  return {
    mode: rawMode as NormalizedPostActionMode,
    targetNodeId: stringValue(nodeData.postAction.targetNodeId),
    prompt: stringValue(nodeData.postAction.prompt),
  };
}

export type NormalizedAIPolicyMode =
  | "NEVER"
  | "FREE_FORM_ONLY"
  | "LOW_CONFIDENCE_ONLY"
  | "ALWAYS_CONVERSATIONAL";

export type NormalizedAIFailureBehavior =
  | "LOCAL_KB"
  | "RETURN_CONTEXT"
  | "TRANSFER"
  | "CUSTOM_DESTINATION";

export interface NormalizedIVRAIPolicyConfig {
  mode: NormalizedAIPolicyMode;
  timeoutMs: number;
  failureBehavior: NormalizedAIFailureBehavior;
  failureTargetNodeId: string | null;
  confidenceThreshold: number;
  allowRerank: boolean;
}

export function normalizeAIPolicy(
  nodeData: Record<string, unknown> | undefined
): NormalizedIVRAIPolicyConfig | null {
  if (!isRecord(nodeData) || !isRecord(nodeData.aiPolicy)) return null;

  const raw = nodeData.aiPolicy;
  const rawMode = stringValue(raw.mode)?.toUpperCase();
  const validModes: NormalizedAIPolicyMode[] = [
    "NEVER",
    "FREE_FORM_ONLY",
    "LOW_CONFIDENCE_ONLY",
    "ALWAYS_CONVERSATIONAL",
  ];

  if (!rawMode || !validModes.includes(rawMode as NormalizedAIPolicyMode)) {
    return null;
  }

  const rawTimeout = typeof raw.timeoutMs === "number" ? raw.timeoutMs : Number(raw.timeoutMs);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.max(500, Math.min(30000, Math.round(rawTimeout)))
      : 8000;

  const validFailures: NormalizedAIFailureBehavior[] = [
    "LOCAL_KB",
    "RETURN_CONTEXT",
    "TRANSFER",
    "CUSTOM_DESTINATION",
  ];
  const rawFailure = stringValue(raw.failureBehavior)?.toUpperCase();
  const failureBehavior =
    rawFailure && validFailures.includes(rawFailure as NormalizedAIFailureBehavior)
      ? (rawFailure as NormalizedAIFailureBehavior)
      : "LOCAL_KB";

  const rawConfidence = typeof raw.confidenceThreshold === "number" ? raw.confidenceThreshold : Number(raw.confidenceThreshold);
  const confidenceThreshold =
    Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
      ? rawConfidence
      : 0.7;

  const allowRerank = raw.allowRerank !== false;

  return {
    mode: rawMode as NormalizedAIPolicyMode,
    timeoutMs,
    failureBehavior,
    failureTargetNodeId: stringValue(raw.failureTargetNodeId),
    confidenceThreshold,
    allowRerank,
  };
}

export type NormalizedConversationalEscapeReturnBehavior =
  | "RETURN_CONTEXT"
  | "STAY_CONVERSATIONAL"
  | "FOLLOW_TARGET_POST_ACTION";

export interface NormalizedIVRConversationalEscapeConfig {
  enabled: boolean;
  targetNodeId: string | null;
  prompt: string | null;
  returnBehavior: NormalizedConversationalEscapeReturnBehavior;
}

export function normalizeConversationalEscapeConfig(
  nodeData: Record<string, unknown> | undefined
): NormalizedIVRConversationalEscapeConfig | null {
  if (!isRecord(nodeData)) return null;

  const raw = isRecord(nodeData.conversationalEscape) ? nodeData.conversationalEscape : null;

  if (raw) {
    const enabled = Boolean(raw.enabled);
    if (!enabled) {
      return {
        enabled: false,
        targetNodeId: null,
        prompt: null,
        returnBehavior: "RETURN_CONTEXT",
      };
    }

    const targetNodeId = stringValue(raw.targetNodeId);
    const prompt = stringValue(raw.prompt);
    const rawReturn = stringValue(raw.returnBehavior)?.toUpperCase();
    const validReturns: NormalizedConversationalEscapeReturnBehavior[] = [
      "RETURN_CONTEXT",
      "STAY_CONVERSATIONAL",
      "FOLLOW_TARGET_POST_ACTION",
    ];
    const returnBehavior: NormalizedConversationalEscapeReturnBehavior =
      rawReturn && validReturns.includes(rawReturn as NormalizedConversationalEscapeReturnBehavior)
        ? (rawReturn as NormalizedConversationalEscapeReturnBehavior)
        : "RETURN_CONTEXT";

    return {
      enabled,
      targetNodeId,
      prompt,
      returnBehavior,
    };
  }

  // Legacy fallback support for older boolean flags if conversationalEscape is absent
  const legacyEnabled =
    Boolean(nodeData.allowNaturalLanguageEscape) ||
    Boolean(nodeData.naturalLanguageEscapeEnabled);

  if (legacyEnabled) {
    const targetNodeId =
      stringValue(nodeData.escapeNodeId) ??
      stringValue(nodeData.fallbackNodeId) ??
      stringValue(nodeData.escapeTargetNodeId);

    return {
      enabled: true,
      targetNodeId,
      prompt: null,
      returnBehavior: "RETURN_CONTEXT",
    };
  }

  return null;
}
