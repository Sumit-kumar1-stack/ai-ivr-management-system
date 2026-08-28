import { getPlivoEnvironment } from "@/config/env";
import { createCallLogger, normalizeError } from "@/lib/logger";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";
import type { HumanTransferAdapter, HumanTransferRequest, HumanTransferResult } from "@/services/telephony/human-transfer.types";

/** Plivo moves the active A-leg to a signed XML URL; that URL returns <Dial>. */
export class PlivoHumanTransferAdapter implements HumanTransferAdapter {
  readonly provider = "PLIVO" as const;

  isConfigured(): boolean {
    try {
      const config = getPlivoEnvironment();
      return Boolean(config.authId && config.authToken && config.publicBaseUrl);
    } catch { return false; }
  }

  async transfer(request: HumanTransferRequest): Promise<HumanTransferResult> {
    const providerCallId = request.providerCallId.trim();
    const destination = normalizeDestination(request.destination, request.strategy);
    if (!destination) return failure(request, "INVALID_TRANSFER_DESTINATION", "The configured human-agent destination is invalid.");
    if (request.strategy === "QUEUE") return failure(request, "TRANSFER_STRATEGY_NOT_SUPPORTED", "Plivo queue transfer is not configured for this destination.");
    if (request.signal?.aborted) return failure(request, "TRANSFER_ABORTED", "Human transfer was cancelled.");

    const config = getPlivoEnvironment();
    const transferUrl = getPlivoPublicCallbackUrl("/api/plivo/transfer", { callId: request.callId }).toString();
    const log = createCallLogger(request.callId);
    try {
      const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/${encodeURIComponent(providerCallId)}/`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ legs: "aleg", aleg_url: transferUrl, aleg_method: "POST" }), signal: request.signal,
      });
      if (!response.ok) {
        log.warn({ event: "plivo.agent_transfer.rejected", providerCallId, status: response.status }, "Plivo rejected active-call transfer");
        return failure(request, "PLIVO_TRANSFER_REJECTED", "Plivo could not start the human transfer.");
      }
      const payload = await response.json().catch(() => ({})) as { api_id?: unknown; request_uuid?: unknown };
      const transferReference = typeof payload.api_id === "string" ? payload.api_id : typeof payload.request_uuid === "string" ? payload.request_uuid : providerCallId;
      log.info({ event: "plivo.agent_transfer.accepted", providerCallId, transferReference }, "Plivo accepted active-call transfer command");
      return { success: true, provider: "PLIVO", providerCallId, destination, transferReference, message: "Plivo accepted the human transfer instruction." };
    } catch (error) {
      log.error({ event: "plivo.agent_transfer.failed", providerCallId, error: normalizeError(error) }, "Plivo active-call transfer failed");
      return failure(request, "PLIVO_TRANSFER_FAILED", "Plivo could not start the human transfer.");
    }
  }
}

function normalizeDestination(value: string, strategy: HumanTransferRequest["strategy"]): string | null {
  const normalized = value.trim();
  if (strategy === "SIP") return /^sips?:[^\s<>]+$/i.test(normalized) ? normalized : null;
  const phone = normalized.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

function failure(request: HumanTransferRequest, code: string, message: string): HumanTransferResult {
  return { success: false, provider: "PLIVO", providerCallId: request.providerCallId.trim(), code, message };
}
