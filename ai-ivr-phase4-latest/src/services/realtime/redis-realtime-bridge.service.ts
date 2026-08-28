import { randomUUID } from "crypto";
import type IORedis from "ioredis";

import {
  redisConnection,
} from "@/lib/redis";

import {
  createLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getIO,
  isSocketServerInitialized,
} from "@/server/socket";

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const REALTIME_CHANNEL =
  "ai-ivr:realtime-events";

const SOURCE_PROCESS =
  process.env.IVR_PROCESS_NAME?.trim() ||
  "unknown";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface RealtimeEnvelope {
  id: string;
  event: string;
  payload: unknown;
  sourceProcess: string;
  timestamp: string;
}

type RealtimeBridgeGlobal =
  typeof globalThis & {
    __ivrRealtimeSubscriber?:
      IORedis;

    __ivrRealtimeSubscriberStarted?:
      boolean;
  };

//--------------------------------------------------
// State
//--------------------------------------------------

const realtimeGlobal =
  globalThis as
    RealtimeBridgeGlobal;

const log =
  createLogger({
    component:
      "redis-realtime-bridge",
  });

//--------------------------------------------------
// Publish
//--------------------------------------------------

export async function publishRealtimeEvent(
  event: string,
  payload: unknown
): Promise<void> {
  const eventName =
    event.trim();

  if (
    !eventName
  ) {
    throw new Error(
      "Realtime event name is required"
    );
  }

  const envelope:
    RealtimeEnvelope = {
      id:
        randomUUID(),

      event:
        eventName,

      payload,

      sourceProcess:
        SOURCE_PROCESS,

      timestamp:
        new Date()
          .toISOString(),
    };

  try {
    await redisConnection.publish(
      REALTIME_CHANNEL,
      JSON.stringify(
        envelope
      )
    );

    log.debug(
      {
        event:
          "realtime.redis.published",

        realtimeEvent:
          eventName,

        realtimeEventId:
          envelope.id,

        sourceProcess:
          SOURCE_PROCESS,
      },
      "Realtime event published to Redis"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "realtime.redis.publish_failed",

        realtimeEvent:
          eventName,

        sourceProcess:
          SOURCE_PROCESS,

        error:
          normalizeError(
            error
          ),
      },
      "Failed to publish realtime event"
    );

    throw error;
  }
}

//--------------------------------------------------
// Start Web Subscriber
//--------------------------------------------------

export async function startRealtimeSubscriber():
  Promise<void> {
  if (
    realtimeGlobal
      .__ivrRealtimeSubscriberStarted
  ) {
    log.debug(
      {
        event:
          "realtime.redis.subscriber_skipped",

        reason:
          "already_started",
      },
      "Redis realtime subscriber is already running"
    );

    return;
  }

  if (
    !isSocketServerInitialized()
  ) {
    throw new Error(
      "Socket.IO must be initialized before the realtime Redis subscriber"
    );
  }

  /*
   * Redis subscriber connections cannot be used for
   * normal Redis commands, so a dedicated duplicate
   * connection is required.
   */
  const subscriber =
    redisConnection.duplicate();

  realtimeGlobal
    .__ivrRealtimeSubscriber =
    subscriber;

  realtimeGlobal
    .__ivrRealtimeSubscriberStarted =
    true;

  subscriber.on(
    "error",
    error => {
      log.error(
        {
          event:
            "realtime.redis.subscriber_error",

          error:
            normalizeError(
              error
            ),
        },
        "Redis realtime subscriber error"
      );
    }
  );

  subscriber.on(
    "reconnecting",
    (delay: number) => {
      log.warn(
        {
          event:
            "realtime.redis.subscriber_reconnecting",

          delay,
        },
        "Redis realtime subscriber reconnecting"
      );
    }
  );

  subscriber.on(
    "message",
    (
      channel,
      rawMessage
    ) => {
      if (
        channel !==
        REALTIME_CHANNEL
      ) {
        return;
      }

      handleRealtimeMessage(
        rawMessage
      );
    }
  );

  await subscriber.subscribe(
    REALTIME_CHANNEL
  );

  log.info(
    {
      event:
        "realtime.redis.subscriber_started",

      channel:
        REALTIME_CHANNEL,
    },
    "Redis realtime subscriber started"
  );
}

//--------------------------------------------------
// Handle Redis Message
//--------------------------------------------------

function handleRealtimeMessage(
  rawMessage: string
): void {
  try {
    const parsed:
      unknown =
      JSON.parse(
        rawMessage
      );

    if (
      !isRealtimeEnvelope(
        parsed
      )
    ) {
      log.warn(
        {
          event:
            "realtime.redis.invalid_message",
        },
        "Invalid realtime Redis message ignored"
      );

      return;
    }

    if (
      !isSocketServerInitialized()
    ) {
      log.warn(
        {
          event:
            "realtime.socket.unavailable",

          realtimeEvent:
            parsed.event,

          realtimeEventId:
            parsed.id,
        },
        "Socket.IO unavailable for realtime event"
      );

      return;
    }

    const room =
      resolveTenantRoom(
        parsed.payload
      );

    if (
      room
    ) {
      getIO().to(
        room
      ).emit(
        parsed.event,
        parsed.payload
      );
    } else {
      log.warn(
        {
          event:
            "realtime.redis.tenant_event_dropped",

          realtimeEvent:
            parsed.event,

          realtimeEventId:
            parsed.id,
        },
        "Tenant-scoped realtime event dropped because tenantId was missing"
      );

      return;
    }

    log.debug(
      {
        event:
          "realtime.socket.broadcast",

        realtimeEvent:
          parsed.event,

        realtimeEventId:
          parsed.id,

        sourceProcess:
          parsed.sourceProcess,
      },
      "Realtime event broadcast to dashboard"
    );
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "realtime.redis.message_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Failed to process realtime Redis message"
    );
  }
}

//--------------------------------------------------
// Validation
//--------------------------------------------------

function isRealtimeEnvelope(
  value: unknown
): value is RealtimeEnvelope {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const envelope =
    value as
      Partial<RealtimeEnvelope>;

  return (
    typeof envelope.id ===
      "string" &&
    envelope.id.length >
      0 &&
    typeof envelope.event ===
      "string" &&
    envelope.event.length >
      0 &&
    typeof envelope.sourceProcess ===
      "string" &&
    typeof envelope.timestamp ===
      "string"
  );
}

function resolveTenantRoom(
  payload: unknown
): string | null {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return null;
  }

  const record =
    payload as {
      tenantId?: unknown;
    };

  if (
    typeof record.tenantId !==
    "string"
  ) {
    return null;
  }

  const tenantId =
    record.tenantId.trim();

  return tenantId
    ? `tenant:${tenantId}`
    : null;
}

//--------------------------------------------------
// Shutdown
//--------------------------------------------------

export async function closeRealtimeSubscriber():
  Promise<void> {
  const subscriber =
    realtimeGlobal
      .__ivrRealtimeSubscriber;

  realtimeGlobal
    .__ivrRealtimeSubscriber =
    undefined;

  realtimeGlobal
    .__ivrRealtimeSubscriberStarted =
    false;

  if (
    !subscriber ||
    subscriber.status ===
      "end"
  ) {
    return;
  }

  try {
    await subscriber.unsubscribe(
      REALTIME_CHANNEL
    );

    await subscriber.quit();

    log.info(
      {
        event:
          "realtime.redis.subscriber_closed",
      },
      "Redis realtime subscriber closed"
    );
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "realtime.redis.subscriber_close_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Redis realtime subscriber shutdown failed"
    );

    subscriber.disconnect();
  }
}
