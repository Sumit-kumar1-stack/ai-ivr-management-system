import {
  AppEvent,
} from "@/core/events";

export type DashboardSocketEvent =
  | "CALL_STARTED"
  | "CALL_RINGING"
  | "CALL_ANSWERED"
  | "CALL_COMPLETED"
  | "CALL_FAILED"
  | "CALL_LISTENING"
  | "CALL_THINKING"
  | "CALL_SPEAKING"
  | "CALL_INTERRUPTED"
  | "TRANSCRIPT"
  | "AI_RESPONSE"
  | "DASHBOARD_UPDATED"
  | "DASHBOARD_METRICS"
  | "DASHBOARD_TIMELINE"
  | "ACTIVE_CALL_UPDATED"
  | "METRICS_UPDATED"
  | "AUDIO_CONNECTED"
  | "AUDIO_DISCONNECTED"
  | "AUDIO_CHUNK_RECEIVED"
  | "AUDIO_CHUNK_SENT";

export interface DashboardRealtimeEvent {
  event: DashboardSocketEvent;
  payload: unknown;
}

interface ConversationMessagePayload {
  callId: string;
  role: "USER" | "ASSISTANT";
  text: string;
  timestamp?: number;
  tenantId?: string;
}

export function mapAppEventToDashboardEvent(
  event: AppEvent,
  payload: unknown
): DashboardRealtimeEvent | null {
  switch (
    event
  ) {
    case AppEvent.CALL_STARTED:
      return {
        event:
          "CALL_STARTED",

        payload,
      };

    case AppEvent.CALL_RINGING:
      return {
        event:
          "CALL_RINGING",

        payload,
      };

    case AppEvent.CALL_ANSWERED:
      return {
        event:
          "CALL_ANSWERED",

        payload,
      };

    case AppEvent.CALL_COMPLETED:
      return {
        event:
          "CALL_COMPLETED",

        payload,
      };

    case AppEvent.CALL_FAILED:
      return {
        event:
          "CALL_FAILED",

        payload,
      };

    case AppEvent.VOICE_LISTENING:
      return {
        event:
          "CALL_LISTENING",

        payload,
      };

    case AppEvent.VOICE_THINKING:
      return {
        event:
          "CALL_THINKING",

        payload,
      };

    case AppEvent.VOICE_SPEAKING:
      return {
        event:
          "CALL_SPEAKING",

        payload,
      };

    case AppEvent.VOICE_INTERRUPTED:
      return {
        event:
          "CALL_INTERRUPTED",

        payload,
      };

    case AppEvent.CONVERSATION_MESSAGE:
      return mapConversationMessage(
        payload
      );

    case AppEvent.DASHBOARD_UPDATED:
      return {
        event:
          "DASHBOARD_UPDATED",

        payload,
      };

    case AppEvent.DASHBOARD_METRICS:
      return {
        event:
          "DASHBOARD_METRICS",

        payload,
      };

    case AppEvent.DASHBOARD_TIMELINE:
      return {
        event:
          "DASHBOARD_TIMELINE",

        payload,
      };

    case AppEvent.ACTIVE_CALL_UPDATED:
      return {
        event:
          "ACTIVE_CALL_UPDATED",

        payload,
      };

    case AppEvent.METRICS_UPDATED:
      return {
        event:
          "METRICS_UPDATED",

        payload,
      };

    case AppEvent.AUDIO_CONNECTED:
      return {
        event:
          "AUDIO_CONNECTED",

        payload,
      };

    case AppEvent.AUDIO_DISCONNECTED:
      return {
        event:
          "AUDIO_DISCONNECTED",

        payload,
      };

    case AppEvent.AUDIO_CHUNK_RECEIVED:
      return {
        event:
          "AUDIO_CHUNK_RECEIVED",

        payload,
      };

    case AppEvent.AUDIO_CHUNK_SENT:
      return {
        event:
          "AUDIO_CHUNK_SENT",

        payload,
      };

    /*
     * Conversation lifecycle, summary, analysis and
     * voice-completed events currently have no direct
     * dashboard listener.
     */
    default:
      return null;
  }
}

function mapConversationMessage(
  payload: unknown
): DashboardRealtimeEvent | null {
  if (
    !isConversationMessagePayload(
      payload
    )
  ) {
    return null;
  }

  return {
    event:
      payload.role ===
        "USER"
        ? "TRANSCRIPT"
        : "AI_RESPONSE",

    payload: {
      callId:
        payload.callId,

      text:
        payload.text,

      role:
        payload.role,

      timestamp:
        payload.timestamp,

      tenantId:
        payload.tenantId,
    },
  };
}

function isConversationMessagePayload(
  payload: unknown
): payload is ConversationMessagePayload {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return false;
  }

  const record =
    payload as Record<
      string,
      unknown
    >;

  return (
    typeof record.callId ===
      "string" &&
    record.callId.trim().length >
      0 &&
    (
      record.role ===
        "USER" ||
      record.role ===
        "ASSISTANT"
    ) &&
    typeof record.text ===
      "string" &&
    record.text.trim().length >
      0 &&
    (
      record.timestamp ===
        undefined ||
      typeof record.timestamp ===
        "number"
    )
  );
}
