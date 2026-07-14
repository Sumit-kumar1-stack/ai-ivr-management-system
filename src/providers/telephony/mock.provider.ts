import { randomUUID } from "crypto";

import { BaseTelephonyProvider } from "./base.provider";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  getCallByProviderId,
  updateCallStatus,
} from "@/services/calls/call.service";

import {
  SilenceDetector,
} from "@/services/conversations/silence-detector.service";

import {
  PartialTranscriptService,
} from "@/services/conversations/partial-transcript.service";

import {
  BargeInService,
} from "@/services/voice/barge-in.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  ConversationEvents,
} from "@/services/conversations/conversation-events.service";

import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class MockProvider extends BaseTelephonyProvider {

  async makeCall(
    request: CallRequest
  ): Promise<CallResponse> {

    console.log("📞 Mock Calling:", request.to);

    const providerCallId = randomUUID();

    //--------------------------------------------------
    // Ringing
    //--------------------------------------------------

    setTimeout(async () => {

      console.log("☎️ RINGING");

      await updateCallStatus({
        providerCallId,
        status: "ringing",
      });

    }, 2000);

    //--------------------------------------------------
    // Answered
    //--------------------------------------------------

    setTimeout(async () => {

      console.log("✅ ANSWERED");

      await updateCallStatus({
        providerCallId,
        status: "answered",
      });

      const call =
        await getCallByProviderId(providerCallId);

      if (!call) {

        console.log(
          "❌ Call not found:",
          providerCallId
        );

        return;

      }

      //--------------------------------------------------
      // Conversation State
      //--------------------------------------------------

      ConversationStateService.setState(
        call.id,
        "LISTENING"
      );

      ConversationEvents.emit(
        "listening",
        call.id
      );

      //--------------------------------------------------
      // Clear Previous Transcript
      //--------------------------------------------------

      PartialTranscriptService.clear(call.id);

      //--------------------------------------------------
      // Simulated Streaming STT
      //--------------------------------------------------

      const partials = [

        "What",

        "What is",

        "What is the",

        "What is the interest",

        "What is the interest rate?"

      ];

      let processed = false;

      for (const partial of partials) {

        console.log(
          `🎤 Partial: ${partial}`
        );

        BargeInService.interrupt(
  call.id
);

PartialTranscriptService.update(
  call.id,
  partial
);

        SilenceDetector.reset(
          call.id,
          async () => {

            if (processed) return;

            processed = true;

            console.log(
              "\n🔇 User stopped speaking\n"
            );

            ConversationStateService.setState(
              call.id,
              "THINKING"
            );

            ConversationEvents.emit(
              "thinking",
              call.id
            );

            const finalTranscript =
            PartialTranscriptService.get(call.id);

            PartialTranscriptService.clear(call.id);

            await processUserMessage(
              call.id,
              finalTranscript
            );

          }
        );

        await sleep(600);

      }

    }, 5000);

    //--------------------------------------------------
    // Completed
    //--------------------------------------------------

    setTimeout(async () => {

      console.log("📴 COMPLETED");

      await updateCallStatus({

        providerCallId,

        status: "completed",

        duration: 30,

      });

      const call =
        await getCallByProviderId(providerCallId);

      if (call) {

        ConversationStateService.setState(
          call.id,
          "IDLE"
        );

        ConversationEvents.emit(
          "idle",
          call.id
        );

        PartialTranscriptService.clear(call.id);

      }

    }, 20000);

    return {

      callId: providerCallId,

      status: "queued",

    };

  }

  async endCall(callId: string) {

    console.log("📴 End Call:", callId);

  }

}