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

    /**
     * Sprint 5.2
     * Real API request goes here.
     */

    return {
      callId: "pending",
      status: "queued",
    };
  }

  async endCall(callId: string) {}
}