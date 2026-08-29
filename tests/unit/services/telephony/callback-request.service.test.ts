import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallbackRequestStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({ callFindUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), publishLinked: vi.fn(), finalize: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { call: { findUnique: mocks.callFindUnique }, callbackRequest: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update, findMany: mocks.findMany } } }));
vi.mock("@/services/communication/communication-campaign-finalizer.service", () => ({ tryFinalizeCommunicationCampaign: mocks.finalize }));
vi.mock("@/services/communication/communication-outbound-events.service", () => ({
  OUTBOUND_REALTIME_EVENTS: { CALLBACK_UPDATED: "outbound.callback.updated" },
  publishOutboundCallLinkedEvent: mocks.publishLinked,
}));

import { createCallbackRequest, getTenantCallback, listTenantCallbacks, updateCallbackLifecycle } from "@/services/telephony/callback-request.service";

describe("tenant-scoped callback lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callFindUnique.mockResolvedValue({ id: "call-1", tenantId: "tenant-a", contactId: "contact-1" });
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "callback-1", status: CallbackRequestStatus.PENDING });
    mocks.update.mockImplementation(({ data }) => Promise.resolve({ id: "callback-1", callId: "call-1", originalCallId: "call-1", ...data }));
    mocks.publishLinked.mockResolvedValue(true);
  });

  it("creates an unconfirmed callback request and rejects a second active request", async () => {
    await expect(createCallbackRequest({ originalCallId: "call-1", callbackNumber: "+14155550123", preferredStart: new Date("2026-08-30T10:00:00Z"), timezone: "UTC" })).resolves.toMatchObject({ status: CallbackRequestStatus.PENDING });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", originalCallId: "call-1", status: CallbackRequestStatus.PENDING }) }));
    mocks.findFirst.mockResolvedValue({ id: "callback-existing" });
    await expect(createCallbackRequest({ originalCallId: "call-1", callbackNumber: "+14155550123", preferredStart: new Date("2026-08-30T10:00:00Z"), timezone: "UTC" })).rejects.toThrow("CALLBACK_ACTIVE_REQUEST_EXISTS");
  });

  it("requires confirmation before schedule, and persists each permitted state", async () => {
    mocks.findFirst.mockResolvedValue({ id: "callback-1", tenantId: "tenant-a", status: CallbackRequestStatus.PENDING });
    await expect(updateCallbackLifecycle("tenant-a", "callback-1", "schedule")).rejects.toThrow("CALLBACK_CONFIRMATION_REQUIRED");
    mocks.findFirst.mockResolvedValue({ id: "callback-1", tenantId: "tenant-a", status: CallbackRequestStatus.CONFIRMED });
    await updateCallbackLifecycle("tenant-a", "callback-1", "claim");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: CallbackRequestStatus.CLAIMED, claimedAt: expect.any(Date) }) }));
    expect(mocks.publishLinked).toHaveBeenCalledWith(
      "call-1",
      "outbound.callback.updated",
      expect.objectContaining({ callbackStatus: CallbackRequestStatus.CLAIMED, requested: true, completed: false })
    );
  });

  it("does not treat scheduling as completion and finalizes only after authoritative completion", async () => {
    mocks.findFirst.mockResolvedValue({ id: "callback-1", tenantId: "tenant-a", callId: "call-1", originalCallId: "call-1", status: CallbackRequestStatus.CONFIRMED });
    await updateCallbackLifecycle("tenant-a", "callback-1", "schedule");
    expect(mocks.publishLinked).toHaveBeenLastCalledWith(
      "call-1",
      "outbound.callback.updated",
      expect.objectContaining({ callbackStatus: CallbackRequestStatus.SCHEDULED, completed: false })
    );
    expect(mocks.finalize).not.toHaveBeenCalled();

    mocks.findFirst.mockResolvedValue({ id: "callback-1", tenantId: "tenant-a", callId: "call-1", originalCallId: "call-1", status: CallbackRequestStatus.SCHEDULED });
    mocks.callFindUnique.mockResolvedValue({ communicationCampaignId: "campaign-1" });
    await updateCallbackLifecycle("tenant-a", "callback-1", "complete");
    expect(mocks.publishLinked).toHaveBeenLastCalledWith(
      "call-1",
      "outbound.callback.updated",
      expect.objectContaining({ callbackStatus: CallbackRequestStatus.COMPLETED, completed: true })
    );
    expect(mocks.finalize).toHaveBeenCalledWith("campaign-1");
  });

  it("enforces tenant ownership for get, list, and update", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateCallbackLifecycle("tenant-b", "callback-1", "cancel")).rejects.toThrow("CALLBACK_NOT_FOUND");
    await getTenantCallback("tenant-b", "callback-1");
    expect(mocks.findFirst).toHaveBeenLastCalledWith({ where: { id: "callback-1", tenantId: "tenant-b" } });
    await listTenantCallbacks("tenant-b");
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-b" }, orderBy: { createdAt: "desc" } });
  });
});
