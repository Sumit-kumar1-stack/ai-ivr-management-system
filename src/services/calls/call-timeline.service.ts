import { createCallLogger } from "@/lib/logger";
import { CallEventType } from "@prisma/client";
import { CallEventService } from "@/features/call-events";
import { RealtimeService } from "@/services/realtime";

export class CallTimelineService {

  static async started(callId: string) {

    const log = createCallLogger(callId);

    log.info("Call Started");

    await CallEventService.create(
      callId,
      CallEventType.STARTED,
      "Call Started"
    );

    RealtimeService.publish("call.started", {
      callId,
      timestamp: new Date(),
    });

  }

  static async ringing(callId: string) {

    const log = createCallLogger(callId);

    log.info("Call Ringing");

    await CallEventService.create(
      callId,
      CallEventType.RINGING,
      "Call Ringing"
    );

    RealtimeService.publish("call.ringing", {
      callId,
      timestamp: new Date(),
    });

  }

  static async answered(callId: string) {

    const log = createCallLogger(callId);

    log.info("Call Answered");

    await CallEventService.create(
      callId,
      CallEventType.ANSWERED,
      "Call Answered"
    );

    RealtimeService.publish("call.answered", {
      callId,
      timestamp: new Date(),
    });

  }

  static async thinking(callId: string) {

    const log = createCallLogger(callId);

    log.info("AI Thinking");

    await CallEventService.create(
      callId,
      CallEventType.THINKING,
      "AI Thinking"
    );

    RealtimeService.publish("call.thinking", {
      callId,
      timestamp: new Date(),
    });

  }

  static async speaking(callId: string) {

    const log = createCallLogger(callId);

    log.info("AI Speaking");

    await CallEventService.create(
      callId,
      CallEventType.SPEAKING,
      "AI Speaking"
    );

    RealtimeService.publish("call.speaking", {
      callId,
      timestamp: new Date(),
    });

  }

  static async listening(callId: string) {

    const log = createCallLogger(callId);

    log.info("Listening");

    await CallEventService.create(
      callId,
      CallEventType.LISTENING,
      "Listening"
    );

    RealtimeService.publish("call.listening", {
      callId,
      timestamp: new Date(),
    });

  }

  static async interrupted(callId: string) {

    const log = createCallLogger(callId);

    log.info("Barge-In Detected");

    await CallEventService.create(
      callId,
      CallEventType.INTERRUPTED,
      "Barge-In Detected"
    );

    RealtimeService.publish("call.interrupted", {
      callId,
      timestamp: new Date(),
    });

  }

  static async completed(callId: string) {

    const log = createCallLogger(callId);

    log.info("Call Completed");

    await CallEventService.create(
      callId,
      CallEventType.COMPLETED,
      "Call Completed"
    );

    RealtimeService.publish("call.completed", {
      callId,
      timestamp: new Date(),
    });

  }

  static async failed(
    callId: string,
    error: unknown
  ) {

    const log = createCallLogger(callId);

    log.error(
      { error },
      "Call Failed"
    );

    await CallEventService.create(
      callId,
      CallEventType.FAILED,
      "Call Failed",
      {
        error,
      }
    );

    RealtimeService.publish("call.failed", {
      callId,
      error,
      timestamp: new Date(),
    });

  }

}