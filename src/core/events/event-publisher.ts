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
  prisma,
} from "@/lib/prisma";

import {
  eventBus,
} from "./event-bus";

import {
  EventMonitor,
} from "./event-monitor.service";

import {
  createSafeEventSnapshot,
  createSafeAuditSnapshot,
} from "./event-snapshot";

import {
  AppEvent,
  isAuditAppEvent,
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

async function enrichTenantContext(
  event: AppEvent,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const callId =
    getCallId(payload);

  if (!callId) {
    return payload;
  }

  try {
    const call =
      await prisma.call.findUnique({
        where: { id: callId },
        select: {
          tenantId: true,
          campaign: {
            select: {
              ownerUser: {
                select: { tenantId: true },
              },
            },
          },
        },
      });

    const tenantId =
      call?.tenantId ??
      call?.campaign?.ownerUser?.tenantId ??
      null;

    if (tenantId) {
      return { ...payload, tenantId };
    }

    log.warn(
      {
        event: "events.tenant_context.unresolved",
        applicationEvent: event,
        callId,
      },
      "Call event has no authoritative tenant context"
    );
  } catch (error) {
    log.error(
      {
        event: "events.tenant_context.lookup_failed",
        applicationEvent: event,
        callId,
        error: normalizeError(error),
      },
      "Authoritative call tenant lookup failed"
    );
  }

  const withoutTenant = {
    ...payload,
  };

  delete withoutTenant.tenantId;

  return withoutTenant;
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

    const enrichedPayload =
      await enrichTenantContext(
        event,
        payload
      );

    //----------------------------------------
    // Safe In-Memory Monitoring
    //----------------------------------------

    try {
      EventMonitor.add(
        event,
        enrichedPayload
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
          enrichedPayload
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
            isAuditAppEvent(
              event
            )
              ? createSafeAuditSnapshot(
                  enrichedPayload
                )
              : createSafeEventSnapshot(
                  enrichedPayload
                );

          const safeMetadata =
            enrichedPayload.metadata !==
              undefined &&
            enrichedPayload.metadata !==
              null
              ? isAuditAppEvent(
                  event
                )
                ? createSafeAuditSnapshot(
                    enrichedPayload.metadata
                  )
                : createSafeEventSnapshot(
                    enrichedPayload.metadata
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
        enrichedPayload
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

      case AppEvent.CALL_CREATED:
        return CallEventType.CALL_CREATED;

      case AppEvent.CALL_RINGING:
        return CallEventType.RINGING;

      case AppEvent.CALL_ANSWERED:
        return CallEventType.ANSWERED;

      case AppEvent.CALL_COMPLETED:
        return CallEventType.COMPLETED;

      case AppEvent.CALL_TERMINATED:
        return CallEventType.CALL_TERMINATED;

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

      case AppEvent.CAMPAIGN_SELECTED:
        return CallEventType.CAMPAIGN_SELECTED;

      case AppEvent.CUSTOMER_MATCHED:
        return CallEventType.CUSTOMER_MATCHED;

      case AppEvent.AI_SESSION_STARTED:
        return CallEventType.AI_SESSION_STARTED;

      case AppEvent.INTENT_DETECTED:
        return CallEventType.INTENT_DETECTED;

      case AppEvent.RAG_QUERY:
        return CallEventType.RAG_QUERY;

      case AppEvent.DOCUMENT_ACCESSED:
        return CallEventType.DOCUMENT_ACCESSED;

      case AppEvent.AUTH_REQUESTED:
        return CallEventType.AUTH_REQUESTED;

      case AppEvent.AUTH_SUCCEEDED:
        return CallEventType.AUTH_SUCCEEDED;

      case AppEvent.AUTH_FAILED:
        return CallEventType.AUTH_FAILED;

      case AppEvent.ACTION_REQUESTED:
        return CallEventType.ACTION_REQUESTED;

      case AppEvent.POLICY_ALLOWED:
        return CallEventType.POLICY_ALLOWED;

      case AppEvent.POLICY_DENIED:
        return CallEventType.POLICY_DENIED;

      case AppEvent.ACTION_EXECUTED:
        return CallEventType.ACTION_EXECUTED;

      case AppEvent.ACTION_FAILED:
        return CallEventType.ACTION_FAILED;

      case AppEvent.FALLBACK_TRIGGERED:
        return CallEventType.FALLBACK_TRIGGERED;

      case AppEvent.PROVIDER_CHANGED:
        return CallEventType.PROVIDER_CHANGED;

      case AppEvent.HUMAN_TRANSFER:
        return CallEventType.HUMAN_TRANSFER;

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
