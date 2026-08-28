import {
  ProviderCallRequest,
  CallResponse,
} from "@/services/telephony/types";
import { mapProviderStatus } from "./status-map";

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
