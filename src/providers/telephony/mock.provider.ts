import { randomUUID } from "crypto";

import { BaseTelephonyProvider } from "./base.provider";

import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

export class MockProvider extends BaseTelephonyProvider {
  async makeCall(
    request: CallRequest
  ): Promise<CallResponse> {

    console.log("Mock Calling", request.to);

    return {
      callId: randomUUID(),
      status: "queued",
    };
  }

  async endCall(callId: string) {
    console.log("End", callId);
  }
}