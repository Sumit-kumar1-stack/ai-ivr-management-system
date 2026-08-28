import { generateRequestId } from "@/lib/request-id";

export interface AuditRequestContext {
  ipAddress: string | null;
  correlationId: string;
}

export function extractAuditRequestContext(
  request: {
    headers: Headers;
  }
): AuditRequestContext {
  const headerCorrelationId =
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-correlation-id")?.trim() ||
    null;

  return {
    ipAddress:
      readClientAddress(request) === "unknown"
        ? null
        : readClientAddress(request),

    correlationId:
      headerCorrelationId || generateRequestId(),
  };
}

function readClientAddress(
  request: {
    headers: Headers;
  }
): string {
  const forwardedFor =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();

  const realIp = request.headers.get("x-real-ip")?.trim();
  const connectingIp =
    request.headers.get("cf-connecting-ip")?.trim();

  return (
    forwardedFor ||
    realIp ||
    connectingIp ||
    "unknown"
  );
}
