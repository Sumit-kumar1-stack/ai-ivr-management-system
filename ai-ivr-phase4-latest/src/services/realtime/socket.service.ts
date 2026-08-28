import { getIO } from "@/server/socket";

import {
  createServerLogger,
} from "@/lib/logger";

const log = createServerLogger(
  "socket-service"
);

export class SocketService {

  static emit(
    event: string,
    payload: unknown
  ) {

    try {

      const io = getIO();

      const room =
        resolveTenantRoom(
          payload
        );

      if (
        room
      ) {
        io.to(
          room
        ).emit(
          event,
          payload
        );
      } else {
        log.warn(
          {
            event:
              "socket.tenant_event_dropped",

            socketEvent:
              event,
          },
          "Tenant-scoped socket event dropped because tenantId was missing"
        );
      }

    }

    catch {

      // Socket not initialized yet

    }

  }

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
