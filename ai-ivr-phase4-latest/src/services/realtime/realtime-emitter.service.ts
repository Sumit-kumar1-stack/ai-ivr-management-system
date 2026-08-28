import { getIO } from "@/server/socket";

import {
  createServerLogger,
} from "@/lib/logger";

const log = createServerLogger(
  "realtime-emitter"
);

export class RealtimeEmitter {

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
        !room
      ) {
        log.warn(
          {
            event:
              "realtime.tenant_event_dropped",

            realtimeEvent:
              event,
          },
          "Tenant-scoped realtime event dropped because tenantId was missing"
        );

        return;
      }

      io.to(
        room
      ).emit(
        event,
        payload
      );

    } catch {

      // Socket server not started yet

    }

  }

}

function resolveTenantRoom(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    tenantId?: unknown;
  };

  if (typeof record.tenantId !== "string") {
    return null;
  }

  const tenantId = record.tenantId.trim();

  return tenantId ? `tenant:${tenantId}` : null;
}
