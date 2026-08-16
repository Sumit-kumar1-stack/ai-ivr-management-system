import {
  AppEvent,
  EventSubscriber,
} from "@/core/events";

import {
  createServerLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "event-logging-subscriber"
  );

//--------------------------------------------------
// Safe Event Payload Metadata
//--------------------------------------------------

function getPayloadMetadata(
  payload: unknown
): Record<string, unknown> {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return {
      payloadPresent:
        Boolean(
          payload
        ),

      payloadType:
        typeof payload,
    };
  }

  const record =
    payload as Record<
      string,
      unknown
    >;

  return {
    payloadPresent:
      true,

    payloadFieldCount:
      Object.keys(
        record
      ).length,

    callIdPresent:
      typeof record.callId ===
        "string" &&
      record.callId.length >
        0,

    timestampPresent:
      typeof record.timestamp ===
        "number",

    statusPresent:
      typeof record.status ===
        "string",
  };
}

//--------------------------------------------------
// Logging Subscriber
//--------------------------------------------------

export class LoggingSubscriber {
  private static registered =
    false;

  static register():
    void {
    if (
      this.registered
    ) {
      log.debug(
        {
          event:
            "events.logging_subscriber.registration_skipped",

          reason:
            "already_registered",
        },
        "Event logging subscriber is already registered"
      );

      return;
    }

    this.registered =
      true;

    EventSubscriber.on(
      AppEvent.CALL_STARTED,
      payload => {
        log.info(
          {
            event:
              "application_event.received",

            applicationEvent:
              AppEvent.CALL_STARTED,

            ...getPayloadMetadata(
              payload
            ),
          },
          "Call started event received"
        );
      }
    );

    EventSubscriber.on(
      AppEvent.CALL_COMPLETED,
      payload => {
        log.info(
          {
            event:
              "application_event.received",

            applicationEvent:
              AppEvent.CALL_COMPLETED,

            ...getPayloadMetadata(
              payload
            ),
          },
          "Call completed event received"
        );
      }
    );

    log.info(
      {
        event:
          "events.logging_subscriber.registered",

        subscribedEventCount:
          2,
      },
      "Event logging subscriber registered"
    );
  }
}