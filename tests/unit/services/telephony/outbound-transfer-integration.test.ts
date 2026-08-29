import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  publishLinked: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { callEvent: { create: mocks.create } },
}));
vi.mock("@/services/communication/communication-outbound-events.service", () => ({
  OUTBOUND_REALTIME_EVENTS: { TRANSFER_UPDATED: "outbound.transfer.updated" },
  publishOutboundCallLinkedEvent: mocks.publishLinked,
}));

import { persistTransferLifecycle } from "@/services/telephony/agent-transfer-persistence.service";

describe("outbound transfer integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: "event-1" });
    mocks.publishLinked.mockResolvedValue(true);
  });

  it("does not mark a transfer request as transferred", async () => {
    await persistTransferLifecycle("call-1", "REQUESTED");
    expect(mocks.publishLinked).toHaveBeenCalledWith(
      "call-1",
      "outbound.transfer.updated",
      { transferStatus: "REQUESTED", transferred: false }
    );
  });

  it("marks an authoritative connected bridge as transferred", async () => {
    await persistTransferLifecycle("call-1", "CONNECTED");
    expect(mocks.publishLinked).toHaveBeenCalledWith(
      "call-1",
      "outbound.transfer.updated",
      { transferStatus: "CONNECTED", transferred: true }
    );
  });
});
