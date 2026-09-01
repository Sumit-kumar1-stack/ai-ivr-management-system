export type RealtimeInputSupport = "SUPPORTED" | "DEGRADED" | "UNSUPPORTED";

type RealtimeInputProviderCapabilities = {
  supportsDtmf: boolean;
  supportsXmlInput: boolean;
  supportsRealtimeMedia: boolean;
  supportsBidirectionalMedia: boolean;
  supportsRealtimeDtmfDuringMedia: boolean;
};

/**
 * Minimal runtime-input projection of the telephony provider capabilities.
 * This intentionally avoids importing provider clients into route modules;
 * their complete capability declarations remain the provider source of truth.
 */
const REALTIME_INPUT_CAPABILITIES: Record<string, RealtimeInputProviderCapabilities> = {
  TWILIO: { supportsDtmf: true, supportsXmlInput: true, supportsRealtimeMedia: true, supportsBidirectionalMedia: true, supportsRealtimeDtmfDuringMedia: true },
  EXOTEL: { supportsDtmf: true, supportsXmlInput: false, supportsRealtimeMedia: true, supportsBidirectionalMedia: true, supportsRealtimeDtmfDuringMedia: true },
  PLIVO: { supportsDtmf: true, supportsXmlInput: true, supportsRealtimeMedia: true, supportsBidirectionalMedia: true, supportsRealtimeDtmfDuringMedia: true },
  MOCK: { supportsDtmf: false, supportsXmlInput: false, supportsRealtimeMedia: false, supportsBidirectionalMedia: false, supportsRealtimeDtmfDuringMedia: false },
};

export interface RealtimeInputCapabilityResult {
  support: RealtimeInputSupport;
  provider: string | null;
  runtime: string | null;
  inputMode: string;
  message: string;
}

/**
 * Evaluates what a caller can actually do while a realtime media runtime owns
 * the call. It intentionally distinguishes ordinary XML DTMF collection from
 * DTMF event delivery on a bidirectional media stream.
 */
export function resolveRealtimeInputCapability(input: {
  provider?: string | null;
  runtime?: string | null;
  inputMode?: string | null;
}): RealtimeInputCapabilityResult {
  const provider = input.provider?.trim().toUpperCase() || null;
  const runtime = input.runtime?.trim().toUpperCase() || null;
  const inputMode = input.inputMode?.trim().toUpperCase() || "VOICE_AND_DTMF";

  if (inputMode === "STAGED_HYBRID") {
    const capabilities = capabilitiesFor(provider);
    if (provider === "PLIVO" && runtime && capabilities?.supportsXmlInput && capabilities.supportsRealtimeMedia) {
      return { support: "SUPPORTED", provider, runtime, inputMode, message: "Staged Hybrid is supported: Plivo collects keypad input in XML before the realtime AI media session starts." };
    }
    if (!capabilities || !runtime) return { support: "DEGRADED", provider, runtime, inputMode, message: "Staged input support cannot be confirmed until a provider and runtime are selected." };
    return { support: capabilities.supportsXmlInput ? "SUPPORTED" : "UNSUPPORTED", provider, runtime, inputMode, message: capabilities.supportsXmlInput ? "The provider supports XML entry input before the realtime session." : "This provider has no documented XML entry-input capability." };
  }

  if (inputMode !== "VOICE_AND_DTMF") {
    return { support: "SUPPORTED", provider, runtime, inputMode, message: "The selected input mode does not require simultaneous realtime DTMF." };
  }

  const capabilities = capabilitiesFor(provider);
  if (!capabilities || !runtime) {
    return { support: "DEGRADED", provider, runtime, inputMode, message: "Realtime keypad support cannot be confirmed until a provider and runtime are selected." };
  }

  if (capabilities.supportsRealtimeMedia && capabilities.supportsBidirectionalMedia && capabilities.supportsRealtimeDtmfDuringMedia) {
    return { support: "SUPPORTED", provider, runtime, inputMode, message: "Voice and keypad input are supported during the active realtime media session." };
  }

  if (capabilities.supportsDtmf) {
    return {
      support: "UNSUPPORTED",
      provider,
      runtime,
      inputMode,
      message: "Realtime keypad input is not supported by this provider/runtime combination. This provider can collect DTMF only through an XML input-control flow, not while the active media stream owns the call.",
    };
  }

  return { support: "UNSUPPORTED", provider, runtime, inputMode, message: "This provider does not support the requested realtime keypad input mode." };
}

function capabilitiesFor(provider: string | null): RealtimeInputProviderCapabilities | null {
  return provider ? REALTIME_INPUT_CAPABILITIES[provider] ?? null : null;
}
