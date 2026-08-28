import { ProviderFactory } from "@/providers/telephony/provider.factory";

import type { InboundProfileVoiceRuntime } from "@/services/calls/inbound-profile-runtime.service";

export type IVRRuntimeMode = "STANDARD" | "PREMIUM" | "AUTO";
export type IVRSelectedRuntime = "STANDARD" | "PREMIUM";
export type IVRRuntimeComplexityTier = "LOW" | "MEDIUM" | "HIGH";
export type IVRRuntimeUseCase = "FAQ" | "INFORMATION" | "REMINDER" | "SURVEY" | "BASIC_QUALIFICATION" | "ESCALATION" | "UNKNOWN";

export interface IVRRuntimePolicy {
  explicitPremiumRequired?: boolean;
  complexityTier?: IVRRuntimeComplexityTier | null;
  useCase?: IVRRuntimeUseCase | null;
  defaultRuntime?: IVRSelectedRuntime | null;
}

export interface IVRTenantRuntimeContext {
  tenantId?: string | null;
  premiumVoiceEnabled?: boolean | null;
}

export interface IVRFlowRuntimeContext {
  id?: string | null;
  versionId?: string | null;
  name?: string | null;
  description?: string | null;
  runtimeMode?: IVRRuntimeMode | null;
  runtimeDefault?: IVRSelectedRuntime | null;
  nodes?: RuntimeNodeLike[];
}

export interface IVRProfileRuntimeContext {
  voiceRuntime?: InboundProfileVoiceRuntime | null;
  defaultRuntime?: IVRSelectedRuntime | null;
}

export interface SelectRuntimeInput {
  tenant?: IVRTenantRuntimeContext;
  provider?: string | null;
  flow?: IVRFlowRuntimeContext;
  profile?: IVRProfileRuntimeContext;
  policy?: IVRRuntimePolicy;
}

export interface SelectRuntimeResult {
  selectedRuntime: IVRSelectedRuntime;
  reasonCode: string;
  reasonText: string;
}

export interface RuntimePreviewResult {
  expectedRuntime: IVRSelectedRuntime | "USES_DEFAULT";
  reasonCode: string;
  reasonText: string;
}

export interface RuntimeNodeLike {
  id: string;
  data?: Record<string, unknown>;
}

const INFORMATIONAL_USE_CASES = new Set<IVRRuntimeUseCase>([
  "FAQ",
  "INFORMATION",
  "REMINDER",
  "SURVEY",
  "BASIC_QUALIFICATION",
]);

export function selectRuntime(input: SelectRuntimeInput): SelectRuntimeResult {
  const configuredMode = normalizeMode(input.flow?.runtimeMode);
  const defaultRuntime = resolveConfiguredDefault(input);
  const tenantSupportsPremium = Boolean(input.tenant?.premiumVoiceEnabled);
  const provider = normalizeToken(input.provider);

  const explicitCandidate = configuredMode === "STANDARD" || configuredMode === "PREMIUM"
    ? configuredMode
    : null;

  if (explicitCandidate) {
    return resolveCandidate({
      candidate: explicitCandidate,
      defaultRuntime,
      tenantSupportsPremium,
      provider,
      explicit: true,
      reasonCode: explicitCandidate === "PREMIUM" ? "EXPLICIT_PREMIUM" : "EXPLICIT_STANDARD",
      reasonText: explicitCandidate === "PREMIUM"
        ? "Flow configuration explicitly selected the Premium runtime."
        : "Flow configuration explicitly selected the Standard runtime.",
    });
  }

  const policy = normalizePolicy(input, defaultRuntime);
  let candidate: IVRSelectedRuntime = policy.defaultRuntime;
  let reasonCode = "AUTO_DEFAULT_RUNTIME";
  let reasonText = "No stronger AUTO policy matched, so the configured default runtime is used.";

  if (policy.explicitPremiumRequired) {
    candidate = "PREMIUM";
    reasonCode = "AUTO_EXPLICIT_PREMIUM_REQUIRED";
    reasonText = "AUTO policy requires Premium for this flow.";
  } else if (policy.complexityTier === "HIGH") {
    candidate = "PREMIUM";
    reasonCode = "AUTO_HIGH_COMPLEXITY";
    reasonText = "AUTO policy treats the flow as high-complexity and prefers Premium.";
  } else if (policy.useCase && INFORMATIONAL_USE_CASES.has(policy.useCase)) {
    candidate = "STANDARD";
    reasonCode = "AUTO_INFORMATIONAL_USE_CASE";
    reasonText = `AUTO policy classifies the flow as ${policy.useCase.toLowerCase().replaceAll("_", " ")} and prefers Standard.`;
  }

  return resolveCandidate({
    candidate,
    defaultRuntime,
    tenantSupportsPremium,
    provider,
    explicit: false,
    reasonCode,
    reasonText,
    fallbackReasonPrefix: "AUTO policy",
  });
}

export function previewRuntimeSelection(input: {
  flowName?: string | null;
  flowDescription?: string | null;
  node?: {
    label?: string | null;
    description?: string | null;
    prompt?: string | null;
    runtimeMode?: IVRRuntimeMode | null;
    runtimeDefault?: IVRSelectedRuntime | null;
  };
}): RuntimePreviewResult {
  const runtimeMode = normalizeMode(input.node?.runtimeMode);
  const defaultRuntime = normalizeSelectedRuntime(input.node?.runtimeDefault) ?? "STANDARD";

  if (runtimeMode === "STANDARD" || runtimeMode === "PREMIUM") {
    return {
      expectedRuntime: runtimeMode,
      reasonCode: runtimeMode === "PREMIUM" ? "EXPLICIT_PREMIUM" : "EXPLICIT_STANDARD",
      reasonText: runtimeMode === "PREMIUM"
        ? "Flow configuration explicitly selected Premium."
        : "Flow configuration explicitly selected Standard.",
    };
  }

  const text = [
    input.flowName,
    input.flowDescription,
    input.node?.label,
    input.node?.description,
    input.node?.prompt,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (containsAny(text, ["faq", "information", "reminder", "survey", "qualification"])) {
    return {
      expectedRuntime: "STANDARD",
      reasonCode: "AUTO_INFORMATIONAL_USE_CASE",
      reasonText: "Informational FAQ flow.",
    };
  }

  return {
    expectedRuntime: "USES_DEFAULT",
    reasonCode: defaultRuntime === "PREMIUM" ? "AUTO_DEFAULT_PREMIUM" : "AUTO_DEFAULT_STANDARD",
    reasonText: "Uses configured default at runtime.",
  };
}

function resolveCandidate(input: {
  candidate: IVRSelectedRuntime;
  defaultRuntime: IVRSelectedRuntime;
  tenantSupportsPremium: boolean;
  provider: string | null;
  explicit: boolean;
  reasonCode: string;
  reasonText: string;
  fallbackReasonPrefix?: string;
}): SelectRuntimeResult {
  if (isRuntimeSupported(input.provider, input.candidate, input.tenantSupportsPremium)) {
    return {
      selectedRuntime: input.candidate,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
    };
  }

  const fallbacks = uniqueRuntimes([
    input.defaultRuntime,
    input.candidate === "STANDARD" ? "PREMIUM" : "STANDARD",
  ]);

  for (const fallback of fallbacks) {
    if (isRuntimeSupported(input.provider, fallback, input.tenantSupportsPremium)) {
      return {
        selectedRuntime: fallback,
        reasonCode: input.explicit
          ? "EXPLICIT_RUNTIME_FALLBACK"
          : "AUTO_SUPPORTED_FALLBACK",
        reasonText: `${input.fallbackReasonPrefix ?? "Runtime policy"} fell back to ${fallback} because ${describeUnsupported(input.provider, input.candidate, input.tenantSupportsPremium)}.`,
      };
    }
  }

  return {
    selectedRuntime: input.defaultRuntime,
    reasonCode: input.explicit
      ? "EXPLICIT_RUNTIME_UNSUPPORTED"
      : "AUTO_RUNTIME_UNSUPPORTED",
    reasonText: `${input.fallbackReasonPrefix ?? "Runtime policy"} could not confirm provider support and used the configured default runtime.`,
  };
}

interface NormalizedRuntimePolicy {
  explicitPremiumRequired: boolean;
  complexityTier: IVRRuntimeComplexityTier;
  useCase: IVRRuntimeUseCase;
  defaultRuntime: IVRSelectedRuntime;
}

function normalizePolicy(input: SelectRuntimeInput, defaultRuntime: IVRSelectedRuntime): NormalizedRuntimePolicy {
  return {
    explicitPremiumRequired: Boolean(input.policy?.explicitPremiumRequired),
    complexityTier: input.policy?.complexityTier ?? inferComplexityTier(input.flow?.nodes, input.flow?.name, input.flow?.description),
    useCase: input.policy?.useCase ?? inferUseCase(input.flow?.nodes, input.flow?.name, input.flow?.description),
    defaultRuntime: normalizeSelectedRuntime(input.policy?.defaultRuntime)
      ?? normalizeSelectedRuntime(input.flow?.runtimeDefault)
      ?? normalizeSelectedRuntime(input.profile?.defaultRuntime)
      ?? defaultRuntime,
  };
}

function resolveConfiguredDefault(input: SelectRuntimeInput): IVRSelectedRuntime {
  return normalizeSelectedRuntime(input.policy?.defaultRuntime)
    ?? normalizeSelectedRuntime(input.flow?.runtimeDefault)
    ?? normalizeSelectedRuntime(input.profile?.defaultRuntime)
    ?? normalizeProfileRuntime(input.profile?.voiceRuntime)
    ?? "STANDARD";
}

function inferComplexityTier(nodes: RuntimeNodeLike[] | undefined, flowName?: string | null, flowDescription?: string | null): IVRRuntimeComplexityTier {
  const text = collectFlowText(nodes, flowName, flowDescription);
  const nodeKinds = new Set((nodes ?? []).map(node => normalizeToken(node.data?.nodeKind)));
  const totalNodes = (nodes ?? []).length;

  if (text.includes("faq") || text.includes("information") || text.includes("reminder") || text.includes("survey")) {
    return "LOW";
  }

  if (totalNodes >= 8 || nodeKinds.has("AI_CONVERSATION") || nodeKinds.has("KNOWLEDGE") || nodeKinds.has("ACTION")) {
    return "HIGH";
  }

  if (totalNodes >= 4 || nodeKinds.has("TRANSFER") || nodeKinds.has("HUMAN_TRANSFER") || nodeKinds.has("AUTH_GATE")) {
    return "MEDIUM";
  }

  return "LOW";
}

function inferUseCase(nodes: RuntimeNodeLike[] | undefined, flowName?: string | null, flowDescription?: string | null): IVRRuntimeUseCase {
  const text = collectFlowText(nodes, flowName, flowDescription);
  if (containsAny(text, ["faq", "information", "how to", "support", "help"])) return "INFORMATION";
  if (containsAny(text, ["reminder", "appointment", "callback"])) return "REMINDER";
  if (containsAny(text, ["survey", "feedback"])) return "SURVEY";
  if (containsAny(text, ["qualif", "screen", "basic"])) return "BASIC_QUALIFICATION";

  const nodeKinds = new Set((nodes ?? []).map(node => normalizeToken(node.data?.nodeKind)));
  if (nodeKinds.has("CALLBACK")) return "REMINDER";
  if (nodeKinds.has("KNOWLEDGE")) return "FAQ";
  if (nodeKinds.has("CONDITION") || nodeKinds.has("AUTH_GATE")) return "BASIC_QUALIFICATION";
  if (nodeKinds.has("HUMAN_TRANSFER") || nodeKinds.has("TRANSFER")) return "ESCALATION";
  return "UNKNOWN";
}

function isRuntimeSupported(provider: string | null, runtime: IVRSelectedRuntime, premiumVoiceEnabled: boolean): boolean {
  const caps = provider ? resolveProviderCapabilities(provider) : null;
  if (!caps) {
    return false;
  }

  if (runtime === "PREMIUM") {
    return premiumVoiceEnabled && caps.supportsGeminiLive && caps.supportsRealtimeMedia && caps.supportsBidirectionalMedia;
  }

  return caps.supportsRealtimeMedia || caps.supportsXmlInput || caps.supportsCallControlUpdate;
}

function resolveProviderCapabilities(provider: string): {
  supportsRealtimeMedia: boolean;
  supportsBidirectionalMedia: boolean;
  supportsGeminiLive: boolean;
  supportsXmlInput: boolean;
  supportsCallControlUpdate: boolean;
} | null {
  try {
    return ProviderFactory.getProviderForName(provider).capabilities;
  } catch {
    return null;
  }
}

function describeUnsupported(provider: string | null, runtime: IVRSelectedRuntime, premiumVoiceEnabled: boolean): string {
  if (!provider) {
    return "no provider was supplied";
  }
  if (runtime === "PREMIUM" && !premiumVoiceEnabled) {
    return "the tenant is not entitled to Premium voice";
  }
  return `provider ${provider.toUpperCase()} does not support ${runtime}`;
}

function normalizeMode(value: unknown): IVRRuntimeMode | null {
  const token = normalizeToken(value);
  if (token === "STANDARD" || token === "PREMIUM" || token === "AUTO") {
    return token;
  }
  return null;
}

function normalizeSelectedRuntime(value: unknown): IVRSelectedRuntime | null {
  const token = normalizeToken(value);
  return token === "STANDARD" || token === "PREMIUM" ? token : null;
}

function normalizeProfileRuntime(value: InboundProfileVoiceRuntime | null | undefined): IVRSelectedRuntime | null {
  if (value === "GEMINI_LIVE") return "PREMIUM";
  if (value === "CASCADED") return "STANDARD";
  return null;
}

function normalizeToken(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toUpperCase() : null;
}

function containsAny(value: string, fragments: string[]): boolean {
  return fragments.some(fragment => value.includes(fragment));
}

function collectFlowText(nodes: RuntimeNodeLike[] | undefined, flowName?: string | null, flowDescription?: string | null): string {
  const startNode = (nodes ?? []).find(node => normalizeToken(node.data?.nodeKind) === "START");
  return [
    flowName,
    flowDescription,
    startNode?.data?.label,
    startNode?.data?.description,
    startNode?.data?.prompt,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function uniqueRuntimes(values: Array<IVRSelectedRuntime | null | undefined>): IVRSelectedRuntime[] {
  return Array.from(new Set(values.filter((value): value is IVRSelectedRuntime => value === "STANDARD" || value === "PREMIUM")));
}
