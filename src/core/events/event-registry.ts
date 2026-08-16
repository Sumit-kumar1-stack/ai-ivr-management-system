import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  LoggingSubscriber,
  RealtimeSubscriber,
  TimelineSubscriber,
} from "./subscribers";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "event-registry"
  );

//--------------------------------------------------
// Event Registry
//--------------------------------------------------

export class EventRegistry {
  private static initialized =
    false;

  static initialize():
    void {
    if (
      this.initialized
    ) {
      log.debug(
        {
          event:
            "events.registry.initialization_skipped",

          reason:
            "already_initialized",
        },
        "Event registry is already initialized"
      );

      return;
    }

    try {
      TimelineSubscriber.register();

      LoggingSubscriber.register();

      RealtimeSubscriber.register();

      this.initialized =
        true;

      log.info(
        {
          event:
            "events.registry.initialized",

          subscriberCount:
            3,
        },
        "All event subscribers registered"
      );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "events.registry.initialization_failed",

          error:
            normalizeError(
              error
            ),
        },
        "Event registry initialization failed"
      );

      throw error;
    }
  }
}