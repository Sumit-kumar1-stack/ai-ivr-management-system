import { eventBus } from "./event-bus";
import { AppEvent } from "./event-types";

import { Prisma, CallEventType } from "@prisma/client";

import { EventMonitor } from "./event-monitor.service";

import { CallEventService } from "@/features/call-events";

export class EventPublisher {

  static async publish<T>(

    event: AppEvent,

    payload: T

  ) {

    //----------------------------------------
    // Memory
    //----------------------------------------

    EventMonitor.add(
      event,
      payload
    );

    //----------------------------------------
    // Persist Call Event
    //----------------------------------------

    const data = payload as {
      callId?: string;
      metadata?: Prisma.InputJsonValue;
    };

    if (data.callId) {

      await CallEventService.create(

        data.callId,

        this.toCallEventType(event),

        event,

        payload as Prisma.InputJsonValue,

        data.metadata

      );

    }

    //----------------------------------------
    // Publish
    //----------------------------------------

    await eventBus.emitAsync(
      event,
      payload
    );

  }

  private static toCallEventType(
    event: AppEvent
  ): CallEventType {

    switch (event) {

      case AppEvent.CALL_STARTED:
        return CallEventType.STARTED;

      case AppEvent.CALL_RINGING:
        return CallEventType.RINGING;

      case AppEvent.CALL_ANSWERED:
        return CallEventType.ANSWERED;

      case AppEvent.CALL_COMPLETED:
        return CallEventType.COMPLETED;

      case AppEvent.CALL_FAILED:
        return CallEventType.FAILED;

      case AppEvent.VOICE_LISTENING:
        return CallEventType.LISTENING;

      case AppEvent.VOICE_THINKING:
        return CallEventType.THINKING;

      case AppEvent.VOICE_SPEAKING:
        return CallEventType.SPEAKING;

      case AppEvent.VOICE_INTERRUPTED:
        return CallEventType.INTERRUPTED;

      default:
        return CallEventType.STARTED;

    }

  }

}