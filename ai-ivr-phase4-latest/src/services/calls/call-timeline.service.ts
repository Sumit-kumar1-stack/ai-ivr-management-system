import {
  CallEventType,
} from "@prisma/client";

import {
  CallEventService,
} from "@/features/call-events";

import {
  createCallLogger,
} from "@/lib/logger";

export class CallTimelineService {
  static async started(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Call Started"
    );

    await CallEventService.create(
      callId,
      CallEventType.STARTED,
      "Call Started"
    );
  }

  static async ringing(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Call Ringing"
    );

    await CallEventService.create(
      callId,
      CallEventType.RINGING,
      "Call Ringing"
    );
  }

  static async answered(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Call Answered"
    );

    await CallEventService.create(
      callId,
      CallEventType.ANSWERED,
      "Call Answered"
    );
  }

  static async thinking(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "AI Thinking"
    );

    await CallEventService.create(
      callId,
      CallEventType.THINKING,
      "AI Thinking"
    );
  }

  static async speaking(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "AI Speaking"
    );

    await CallEventService.create(
      callId,
      CallEventType.SPEAKING,
      "AI Speaking"
    );
  }

  static async listening(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Listening"
    );

    await CallEventService.create(
      callId,
      CallEventType.LISTENING,
      "Listening"
    );
  }

  static async interrupted(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Barge-In Detected"
    );

    await CallEventService.create(
      callId,
      CallEventType.INTERRUPTED,
      "Barge-In Detected"
    );
  }

  static async completed(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Call Completed"
    );

    await CallEventService.create(
      callId,
      CallEventType.COMPLETED,
      "Call Completed"
    );
  }

  static async failed(
    callId: string,
    error: unknown
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    log.error(
      {
        error:
          errorMessage,
      },
      "Call Failed"
    );

    await CallEventService.create(
      callId,
      CallEventType.FAILED,
      "Call Failed",
      undefined,
      {
        error:
          errorMessage,
      }
    );
  }
}