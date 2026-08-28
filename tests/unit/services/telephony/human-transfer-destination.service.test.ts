import { AccountStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import { resolveTenantHumanTransferDestination } from "@/services/telephony/human-transfer-destination.service";

describe("tenant human transfer destinations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only an active user in the call tenant and normalizes its E.164 phone", async () => {
    mocks.findUnique.mockResolvedValue({ id: "agent-1", tenantId: "tenant-1", phone: "+1 (555) 765-4321", role: "ADMIN", isActive: true, accountStatus: AccountStatus.ACTIVE });

    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toEqual({
      ok: true,
      destination: "+15557654321",
      destinationUserId: "agent-1",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "agent-1" } }));
  });

  it("accepts an active same-tenant AGENT destination", async () => {
    mocks.findUnique.mockResolvedValue({ id: "agent-2", tenantId: "tenant-1", phone: "+15557654321", role: "AGENT", isActive: true, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-2" })).resolves.toMatchObject({
      ok: true,
      destinationUserId: "agent-2",
    });
  });

  it("rejects a missing, cross-tenant, inactive, or invalid selected user", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "other-tenant-agent" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_NOT_FOUND" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-2", phone: "+15557654321", role: "AGENT", isActive: true, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_CROSS_TENANT" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-1", phone: "+15557654321", role: "AGENT", isActive: false, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_INACTIVE" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-1", phone: "+15557654321", role: "AGENT", isActive: true, accountStatus: AccountStatus.SUSPENDED });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_INACTIVE" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-1", phone: "+15557654321", role: "SUPER_ADMIN", isActive: true, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_NOT_FOUND" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-1", phone: null, role: "AGENT", isActive: true, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_PHONE_MISSING" });

    mocks.findUnique.mockResolvedValueOnce({ id: "agent-1", tenantId: "tenant-1", phone: "not-a-phone", role: "AGENT", isActive: true, accountStatus: AccountStatus.ACTIVE });
    await expect(resolveTenantHumanTransferDestination({ tenantId: "tenant-1", destinationUserId: "agent-1" })).resolves.toMatchObject({ ok: false, code: "TRANSFER_DESTINATION_INVALID" });
  });
});
