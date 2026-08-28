import {
  ProviderCallRequest,
  CallResponse,
} from "@/services/telephony/types";
import { mapProviderStatus } from "./status-map";
import type {
  OutboundProviderCallRequest,
  OutboundProviderCallResult,
} from "./outbound-call.types";

export interface TelephonyProviderCapabilities {
  supportsInbound: boolean;
  supportsOutbound: boolean;
  supportsDtmf: boolean;
  /** Provider has a documented XML/call-control input collection verb. */
  supportsXmlInput: boolean;
  /** DTMF events can arrive while this provider owns bidirectional media. */
  supportsRealtimeDtmfDuringMedia: boolean;
  supportsTransfer: boolean;
  supportsRecording: boolean;
  supportsRealtimeMedia: boolean;
  supportsBidirectionalMedia: boolean;
  supportsBargeIn: boolean;
  supportsStatusCallbacks: boolean;
  supportsStreamingTts: boolean;
  supportsGeminiLive: boolean;
  /** A documented safe update from active media to XML call control. */
  supportsCallControlUpdate: boolean;
}


export abstract class BaseTelephonyProvider {
  abstract readonly name: "twilio" | "exotel" | "plivo" | "mock";
  abstract readonly capabilities: TelephonyProviderCapabilities;


  abstract makeCall(
    request: ProviderCallRequest
  ): Promise<CallResponse>;



  abstract endCall(
    callId: string
  ): Promise<void>;



  abstract handleWebhook(
    body: unknown
  ): Promise<void>;

  /** Paid outbound execution is opt-in per adapter. Unsupported providers fail
   * closed instead of pretending to offer parity with the reference adapter. */
  executeOutboundCall(
    request: OutboundProviderCallRequest
  ): Promise<OutboundProviderCallResult> {
    void request;
    throw new Error(
      `Provider ${this.name.toUpperCase()} does not implement CommunicationCampaign outbound calls`
    );
  }

  /** Move an active call to a provider-owned, static failure response. The
   * default is deliberately unsupported so unknown adapters fail closed. */
  async applyStandardTtsFallback(
    callId: string,
    providerCallId: string
  ): Promise<void> {
    void callId;
    void providerCallId;

    throw new Error(
      `Provider ${this.name.toUpperCase()} does not support Standard TTS fallback`
    );
  }

  normalizeCallStatus(status: string) {
    return mapProviderStatus(status);
  }

  normalizeDtmf(value: unknown): string | null {
    const digit = typeof value === "string" ? value.trim() : "";
    return /^[0-9*#]$/.test(digit) ? digit : null;
  }

  normalizeProviderCallId(value: unknown): string | null {
    const providerCallId = typeof value === "string" ? value.trim() : "";
    return providerCallId || null;
  }


}
