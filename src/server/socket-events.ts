import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getIO,
} from "./socket";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "socket-events"
  );

//--------------------------------------------------
// Payload Metadata
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

  const text =
    typeof record.text ===
      "string"
      ? record.text
      : null;

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

    textPresent:
      Boolean(
        text
      ),

    textCharacterCount:
      text?.length ??
      0,

    phonePresent:
      typeof record.phone ===
        "string" &&
      record.phone.length >
        0,

    customerNamePresent:
      typeof record.customerName ===
        "string" &&
      record.customerName.length >
        0,
  };
}

//--------------------------------------------------
// Socket Events
//--------------------------------------------------

export class SocketEvents {
  static emit(
    event: string,
    payload: unknown
  ): boolean {
    try {
      const io =
        getIO();

      io.emit(
        event,
        payload
      );

      log.debug(
        {
          event:
            "socket.event.emitted",

          socketEvent:
            event,

          connectedClientCount:
            io.engine
              .clientsCount,

          ...getPayloadMetadata(
            payload
          ),
        },
        "Socket event emitted"
      );

      return true;
    } catch (
      error
    ) {
      log.warn(
        {
          event:
            "socket.event.emit_failed",

          socketEvent:
            event,

          ...getPayloadMetadata(
            payload
          ),

          error:
            normalizeError(
              error
            ),
        },
        "Socket server is not initialized"
      );

      return false;
    }
  }
}