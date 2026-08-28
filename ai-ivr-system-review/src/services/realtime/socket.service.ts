import { getIO } from "@/server/socket";

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
        io.emit(
          event,
          payload
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
