import { createCallLogger } from "@/lib/logger";
import { getExotelEnvironment } from "@/config/env";
import type { HumanTransferAdapter, HumanTransferRequest, HumanTransferResult } from "@/services/telephony/human-transfer.types";

/**
 * Kept explicit so the graph receives ACTION_FAILURE through its existing
 * runtime rather than attempting an unsafe provider-specific workaround.
 */
export class ExotelHumanTransferAdapter implements HumanTransferAdapter {
  readonly provider = "EXOTEL" as const;

  isConfigured(): boolean {
    try { getExotelEnvironment(); return true; } catch { return false; }
  }

  async transfer(request: HumanTransferRequest): Promise<HumanTransferResult> {
    createCallLogger(request.callId).warn({ event: "exotel.transfer.failed", providerCallId: request.providerCallId, code: "EXOTEL_TRANSFER_UNSUPPORTED", durationMs: 0 }, "Exotel Voice v1 live transfer is not implemented");
    return {
      success: false,
      provider: "EXOTEL",
      providerCallId: request.providerCallId,
      code: "EXOTEL_TRANSFER_UNSUPPORTED",
      message: "Human transfer is not available for the configured Exotel Voice v1 call-control path.",
    };
  }
}
