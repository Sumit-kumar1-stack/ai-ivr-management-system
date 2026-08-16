import {
  AppEvent,
  EventSubscriber,
} from "@/core/events";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  mapAppEventToDashboardEvent,
} from "@/services/realtime/dashboard-event-mapper";

import {
  publishRealtimeEvent,
} from "@/services/realtime/redis-realtime-bridge.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "realtime-subscriber"
  );

//--------------------------------------------------
// Realtime Subscriber
//--------------------------------------------------

export class RealtimeSubscriber {
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
            "realtime.subscriber.registration_skipped",

          reason:
            "already_registered",
        },
        "Realtime subscriber is already registered"
      );

      return;
    }

    this.registered =
      true;

    for (
      const event of
      EventSubscriber.events()
    ) {
      EventSubscriber.on(
        event,
        payload => {
          this.publishDashboardEvent(
            event,
            payload
          );
        }
      );
    }

    log.info(
      {
        event:
          "realtime.subscriber.registered",

        subscribedEventCount:
          EventSubscriber
            .events()
            .length,
      },
      "Realtime subscriber registered"
    );
  }

  //------------------------------------------------
  // Publish Dashboard Event
  //------------------------------------------------

  private static publishDashboardEvent(
    appEvent:
      AppEvent,

    payload:
      unknown
  ): void {
    const dashboardEvent =
      mapAppEventToDashboardEvent(
        appEvent,
        payload
      );

    if (
      !dashboardEvent
    ) {
      log.debug(
        {
          event:
            "realtime.dashboard_mapping.skipped",

          applicationEvent:
            appEvent,

          reason:
            "no_dashboard_mapping",
        },
        "Application event has no dashboard mapping"
      );

      return;
    }

    void publishRealtimeEvent(
      dashboardEvent.event,
      dashboardEvent.payload
    ).catch(
      error => {
        /*
         * Redis delivery is non-critical for active
         * voice processing. The bridge also records
         * the lower-level publish failure.
         */
        log.warn(
          {
            event:
              "realtime.dashboard_publish.failed",

            applicationEvent:
              appEvent,

            dashboardEvent:
              dashboardEvent.event,

            error:
              normalizeError(
                error
              ),
          },
          "Dashboard realtime event publication failed"
        );
      }
    );
  }
}