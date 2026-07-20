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

    RealtimeService.emit("call.started", {
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

    RealtimeService.emit("call.ringing", {
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

    RealtimeService.emit("call.answered", {
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

    RealtimeService.emit("call.thinking", {
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

    RealtimeService.emit("call.speaking", {
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

    RealtimeService.emit("call.listening", {
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

    RealtimeService.emit("call.interrupted", {
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

    RealtimeService.emit("call.completed", {
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
  undefined,
  {
    error:
      error instanceof Error
        ? error.message
        : String(error),
  }
);

    RealtimeService.emit("call.failed", {
      callId,
      error,
      timestamp: new Date(),
    });

  }

}