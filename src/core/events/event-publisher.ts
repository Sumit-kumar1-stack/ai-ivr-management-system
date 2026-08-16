import {
  CallEventType,
  Prisma,
} from "@prisma/client";

import {
  CallEventService,
} from "@/features/call-events";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  eventBus,
} from "./event-bus";

import {
  EventMonitor,
} from "./event-monitor.service";

import {
  createSafeEventSnapshot,
} from "./event-snapshot";

import {
  AppEvent,
  isAppEvent,
} from "./event-types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "event-publisher"
  );

//--------------------------------------------------
// Helpers
//--------------------------------------------------

function isEventPayload(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getCallId(
  payload: Record<string, unknown>
): string | null {
  if (
    typeof payload.callId !==
      "string"
  ) {
    return null;
  }

  const callId =
    payload.callId.trim();

  return callId ||
    null;
}

//--------------------------------------------------
// Event Publisher
//--------------------------------------------------

export class EventPublisher {
  static async publish<T>(
    event: AppEvent,
    payload: T
  ): Promise<boolean> {
    //----------------------------------------
    // Runtime Event Validation
    //----------------------------------------

    if (
      !isAppEvent(event)
    ) {
      log.warn(
        {
          event:
            "events.publish.rejected",

          reason:
            "unknown_event",

          eventNamePresent:
            typeof event ===
              "string",
        },
        "Unknown application event rejected"
      );

      return false;
    }

    //----------------------------------------
    // Runtime Payload Validation
    //----------------------------------------

    if (
      !isEventPayload(
        payload
      )
    ) {
      log.warn(
        {
          event:
            "events.publish.rejected",

          reason:
            "invalid_payload",

          applicationEvent:
            event,

          payloadType:
            Array.isArray(
              payload
            )
              ? "array"
              : typeof payload,
        },
        "Application event payload rejected"
      );

      return false;
    }

    //----------------------------------------
    // Safe In-Memory Monitoring
    //----------------------------------------

    try {
      EventMonitor.add(
        event,
        payload
      );
    } catch (
      error
    ) {
      /*
       * Monitoring is diagnostic only.
       * It must not interrupt business processing.
       */
      log.warn(
        {
          event:
            "events.monitor.failed",

          applicationEvent:
            event,

          error:
            normalizeError(
              error
            ),
        },
        "Event monitor update failed"
      );
    }

    //----------------------------------------
    // Persist Supported Call Events
    //----------------------------------------

    const callEventType =
      this.toCallEventType(
        event
      );

    if (
      callEventType
    ) {
      const callId =
        getCallId(
          payload
        );

      if (
        !callId
      ) {
        log.warn(
          {
            event:
              "events.persistence.skipped",

            applicationEvent:
              event,

            reason:
              "missing_call_id",

            callEventType,
          },
          "Call event persistence skipped"
        );
      } else {
        try {
          const safePayload =
            createSafeEventSnapshot(
              payload
            );

          const safeMetadata =
            payload.metadata !==
              undefined &&
            payload.metadata !==
              null
              ? createSafeEventSnapshot(
                  payload.metadata
                )
              : undefined;

          await CallEventService.create(
            callId,
            callEventType,
            event,
            safePayload as
              Prisma.InputJsonValue,
            safeMetadata as
              | Prisma.InputJsonValue
              | undefined
          );
        } catch (
          error
        ) {
          /*
           * Database event-history failure must not
           * prevent active call processing.
           */
          log.error(
            {
              event:
                "events.persistence.failed",

              applicationEvent:
                event,

              callEventType,

              error:
                normalizeError(
                  error
                ),
            },
            "Call event persistence failed"
          );
        }
      }
    }

    //----------------------------------------
    // Publish To Subscribers
    //----------------------------------------

    try {
      await eventBus.emitAsync(
        event,
        payload
      );

      return true;
    } catch (
      error
    ) {
      /*
       * EventSubscriber wrappers should normally
       * isolate listener failures. This remains as
       * a final protection for unwrapped listeners.
       */
      log.error(
        {
          event:
            "events.delivery.failed",

          applicationEvent:
            event,

          error:
            normalizeError(
              error
            ),
        },
        "Application event delivery failed"
      );

      return false;
    }
  }

  //------------------------------------------------
  // Prisma Event Mapping
  //------------------------------------------------

  private static toCallEventType(
    event: AppEvent
  ): CallEventType | null {
    switch (
      event
    ) {
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

      /*
       * Conversation, dashboard, metric, audio and
       * unsupported voice events do not have a
       * matching Prisma CallEventType.
       */
      default:
        return null;
    }
  }
}