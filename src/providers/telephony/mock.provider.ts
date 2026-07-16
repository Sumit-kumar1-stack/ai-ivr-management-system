import { randomUUID } from "crypto";

import { createCallLogger } from "@/lib/logger";

import { BaseTelephonyProvider } from "./base.provider";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  getCallByProviderId,
  updateCallStatus,
} from "@/services/calls/call.service";

import { CallTimelineService } from "@/services/calls/call-timeline.service";

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockProvider extends BaseTelephonyProvider {

  async makeCall(
    request: CallRequest
  ): Promise<CallResponse> {

    const providerCallId = randomUUID();

    const log =
      createCallLogger(providerCallId);

  CallTimelineService.started(providerCallId);

log.info(
  {
    to: request.to,
  },
  "Outbound call requested"
);

    //--------------------------------------------------
    // Ringing
    //--------------------------------------------------

    setTimeout(async () => {

      try {

        CallTimelineService.ringing(providerCallId);

        await updateCallStatus({
          providerCallId,
          status: "ringing",
        });

      } catch (error) {

        log.error(
          { error },
          "Failed to update ringing status"
        );

      }

    }, 2000);

    //--------------------------------------------------
    // Answered
    //--------------------------------------------------

    setTimeout(async () => {

      try {

        CallTimelineService.answered(providerCallId);

        await updateCallStatus({
          providerCallId,
          status: "answered",
        });

        const call =
          await getCallByProviderId(
            providerCallId
          );

        if (!call) {

          log.error(
            "Internal call not found"
          );

          return;

        }

        //--------------------------------------------
        // Listening State
        //--------------------------------------------

        ConversationStateService.setState(
          call.id,
          "LISTENING"
        );

        ConversationEvents.emit(
          "listening",
          call.id
        );

        //--------------------------------------------
        // Reset Transcript
        //--------------------------------------------

        PartialTranscriptService.clear(
          call.id
        );

        //--------------------------------------------
        // Simulated Streaming STT
        //--------------------------------------------

        const partials = [

          "What",

          "What is",

          "What is the",

          "What is the interest",

          "What is the interest rate?"

        ];

        let processed = false;

        for (const partial of partials) {

          log.debug(
            { partial },
            "Received partial transcript"
          );

          //------------------------------------------
          // Interrupt if AI speaking
          //------------------------------------------

          BargeInService.interrupt(
            call.id
          );

          //------------------------------------------
          // Update partial transcript
          //------------------------------------------

          PartialTranscriptService.update(
            call.id,
            partial
          );

          //------------------------------------------
          // Restart silence timer
          //------------------------------------------

          SilenceDetector.reset(
            call.id,
            async () => {

              if (processed) {
                return;
              }

              processed = true;

              log.info(
                "User finished speaking"
              );

              ConversationStateService.setState(
                call.id,
                "THINKING"
              );

              CallTimelineService.thinking(call.id);

              ConversationEvents.emit(
                "thinking",
                call.id
              );

              const transcript =
                PartialTranscriptService.get(
                  call.id
                );

              PartialTranscriptService.clear(
                call.id
              );

              if (!transcript.trim()) {

                log.warn(
                  "Ignoring empty transcript"
                );

                return;
              }

              await processUserMessage(
                call.id,
                transcript
              );

            }
          );

          await sleep(600);

        }

      } catch (error) {

        log.error(
          { error },
          "Answered flow failed"
        );

      }

    }, 5000);

    //--------------------------------------------------
    // Completed
    //--------------------------------------------------

    setTimeout(async () => {

      try {

        CallTimelineService.completed(providerCallId);

        log.info(
{
duration:30
},
"Mock call completed successfully"
);

        await updateCallStatus({

          providerCallId,

          status: "completed",

          duration: 30,

        });

        const call =
          await getCallByProviderId(
            providerCallId
          );

        if (call) {

          ConversationStateService.setState(
            call.id,
            "IDLE"
          );

          ConversationEvents.emit(
            "idle",
            call.id
          );

          PartialTranscriptService.clear(
            call.id
          );

        }

      } catch (error) {

        CallTimelineService.failed(
  providerCallId,
  error
);
      }

    }, 20000);

    return {

      callId: providerCallId,

      status: "queued",

    };

  }

  async endCall(
    callId: string
  ) {

    const log =
      createCallLogger(callId);

    CallTimelineService.completed(callId);

log.info("Ending mock call");

  }

}