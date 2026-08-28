import { BaseTelephonyProvider } from "./base.provider";

import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

export class TelnyxProvider
  extends BaseTelephonyProvider {
  // Kept out of the factory until this legacy adapter is implemented.
  readonly name = "mock" as const;
  readonly capabilities = {
    supportsInbound: false,
    supportsOutbound: false,
    supportsDtmf: false,
    supportsXmlInput: false,
    supportsRealtimeDtmfDuringMedia: false,
    supportsTransfer: false,
    supportsRecording: false,
    supportsRealtimeMedia: false,
    supportsBidirectionalMedia: false,
    supportsBargeIn: false,
    supportsStatusCallbacks: false,
    supportsStreamingTts: false,
    supportsGeminiLive: false,
    supportsCallControlUpdate: false,
  } as const;

  async makeCall(
    request: CallRequest
  ): Promise<CallResponse> {

    throw new Error(
      "Telnyx integration not implemented."
    );

  }

  async endCall(
    callId: string
  ) {

    throw new Error(
      "Telnyx integration not implemented."
    );

  }

  async handleWebhook(
    body: unknown
) {

    console.log(
        "Telnyx webhook",
        body
    );

}

}

