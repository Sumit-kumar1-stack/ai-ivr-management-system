import { twilioClient } from "./twilio.client";
import { BaseTelephonyProvider } from "./base.provider";
import { createCallLogger } from "@/lib/logger";

import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

export class TwilioProvider extends BaseTelephonyProvider {
  async makeCall(
    request: CallRequest
  ): Promise<CallResponse> {
    const call = await twilioClient.calls.create({
      to: request.to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: process.env.TWILIO_WEBHOOK!,
    });

    const log = createCallLogger(call.sid);

    log.info(
      {
        to: request.to,
        twilioSid: call.sid,
      },
      "Outbound Twilio call queued"
    );

    return {
      callId: call.sid,
      status: "queued",
    };
  }

  async endCall(callId: string) {
    const log = createCallLogger(callId);

    log.info("Ending Twilio call");

    await twilioClient.calls(callId).update({
      status: "completed",
    });

    log.info("Twilio call completed");
  }
}