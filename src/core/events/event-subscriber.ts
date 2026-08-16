import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  eventBus,
} from "./event-bus";

import {
  AppEvent,
  isAppEvent,
} from "./event-types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "event-subscriber"
  );

//--------------------------------------------------
// Types
//--------------------------------------------------

export type EventListener<T> =
  (
    payload: T
  ) =>
    void |
    Promise<void>;

type WrappedListener =
  (
    payload: unknown
  ) =>
    Promise<void>;

//--------------------------------------------------
// Wrapper Registry
//--------------------------------------------------

const wrapperRegistry =
  new WeakMap<
    EventListener<unknown>,
    Map<
      AppEvent,
      Set<WrappedListener>
    >
  >();

function rememberWrapper(
  listener: EventListener<unknown>,
  event: AppEvent,
  wrapper: WrappedListener
): void {
  let eventMap =
    wrapperRegistry.get(
      listener
    );

  if (
    !eventMap
  ) {
    eventMap =
      new Map();

    wrapperRegistry.set(
      listener,
      eventMap
    );
  }

  let wrappers =
    eventMap.get(
      event
    );

  if (
    !wrappers
  ) {
    wrappers =
      new Set();

    eventMap.set(
      event,
      wrappers
    );
  }

  wrappers.add(
    wrapper
  );
}

function forgetWrapper(
  listener: EventListener<unknown>,
  event: AppEvent,
  wrapper: WrappedListener
): void {
  const eventMap =
    wrapperRegistry.get(
      listener
    );

  const wrappers =
    eventMap?.get(
      event
    );

  wrappers?.delete(
    wrapper
  );

  if (
    wrappers?.size ===
    0
  ) {
    eventMap?.delete(
      event
    );
  }

  if (
    eventMap?.size ===
    0
  ) {
    wrapperRegistry.delete(
      listener
    );
  }
}

//--------------------------------------------------
// Event Subscriber
//--------------------------------------------------

export class EventSubscriber {
  static on<T>(
    event: AppEvent,
    listener: EventListener<T>
  ): () => void {
    if (
      !isAppEvent(
        event
      )
    ) {
      log.warn(
        {
          event:
            "events.subscription.rejected",

          reason:
            "unknown_event",
        },
        "Unknown event subscription rejected"
      );

      return () => {
        // No subscription was registered.
      };
    }

    const wrapper:
      WrappedListener =
      async (
        payload: unknown
      ) => {
        try {
          await listener(
            payload as T
          );
        } catch (
          error
        ) {
          /*
           * One failing subscriber must not prevent
           * the remaining subscribers from running.
           */
          log.error(
            {
              event:
                "events.subscriber.failed",

              applicationEvent:
                event,

              listenerName:
                listener.name ||
                "anonymous",

              error:
                normalizeError(
                  error
                ),
            },
            "Application event subscriber failed"
          );
        }
      };

    rememberWrapper(
      listener as unknown as EventListener<unknown>,
      event,
      wrapper
    );

    eventBus.on(
      event,
      wrapper
    );

    return () => {
      this.off(
        event,
        listener
      );
    };
  }

  static once<T>(
    event: AppEvent,
    listener: EventListener<T>
  ): () => void {
    if (
      !isAppEvent(
        event
      )
    ) {
      log.warn(
        {
          event:
            "events.subscription.rejected",

          reason:
            "unknown_event",

          once:
            true,
        },
        "Unknown one-time event subscription rejected"
      );

      return () => {
        // No subscription was registered.
      };
    }

    const wrapper:
      WrappedListener =
      async (
        payload: unknown
      ) => {
        try {
          await listener(
            payload as T
          );
        } catch (
          error
        ) {
          log.error(
            {
              event:
                "events.subscriber.failed",

              applicationEvent:
                event,

              listenerName:
                listener.name ||
                "anonymous",

              once:
                true,

              error:
                normalizeError(
                  error
                ),
            },
            "One-time event subscriber failed"
          );
        } finally {
          forgetWrapper(
            listener as unknown as EventListener<unknown>,
            event,
            wrapper
          );
        }
      };

    rememberWrapper(
      listener as unknown as EventListener<unknown>,
      event,
      wrapper
    );

    eventBus.once(
      event,
      wrapper
    );

    return () => {
      this.off(
        event,
        listener
      );
    };
  }

  static off<T>(
    event: AppEvent,
    listener: EventListener<T>
  ): void {
    const eventMap =
      wrapperRegistry.get(
        listener as unknown as EventListener<unknown>
      );

    const wrappers =
      eventMap?.get(
        event
      );

    if (
      !wrappers
    ) {
      return;
    }

    for (
      const wrapper of
      wrappers
    ) {
      eventBus.off(
        event,
        wrapper
      );
    }

    eventMap?.delete(
      event
    );

    if (
      eventMap?.size ===
      0
    ) {
      wrapperRegistry.delete(
        listener as unknown as EventListener<unknown>
      );
    }
  }

  static events():
    AppEvent[] {
    return Object.values(
      AppEvent
    );
  }
}