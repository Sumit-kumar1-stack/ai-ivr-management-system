import { beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/realtime/redis-realtime-bridge.service", () => ({
  publishRealtimeEvent: publish,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundEvent,
} from "@/services/communication/communication-outbound-events.service";

describe("outbound realtime metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publish.mockResolvedValue(undefined);
  });

  it("emits tenant/campaign scoped metadata and strips sensitive fields", () => {
    publishOutboundEvent(
      OUTBOUND_REALTIME_EVENTS.ATTEMPT_UPDATED,
      { tenantId: "tenant-1", campaignId: "campaign-1", attemptId: "attempt-1" },
      {
        state: "RINGING",
        phone: "+14155550101",
        rawProviderStatus: "ringing",
        authToken: "secret",
      }
    );
    expect(publish).toHaveBeenCalledWith(
      "outbound.attempt.updated",
      expect.objectContaining({
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        attemptId: "attempt-1",
        state: "RINGING",
      })
    );
    const payload = publish.mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("rawProviderStatus");
    expect(payload).not.toHaveProperty("authToken");
  });

  it("drops events without authoritative tenant/campaign scope", () => {
    publishOutboundEvent(OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED, { tenantId: "", campaignId: "campaign-1" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not let Redis observability failure escape canonical settlement", () => {
    publish.mockRejectedValueOnce(new Error("redis unavailable"));
    expect(() => publishOutboundEvent(
      OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED,
      { tenantId: "tenant-1", campaignId: "campaign-1" }
    )).not.toThrow();
  });
});
