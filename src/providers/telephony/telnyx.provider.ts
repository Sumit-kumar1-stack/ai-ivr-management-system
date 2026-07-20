import { BaseTelephonyProvider } from "./base.provider";

import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

export class TelnyxProvider
  extends BaseTelephonyProvider {

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

