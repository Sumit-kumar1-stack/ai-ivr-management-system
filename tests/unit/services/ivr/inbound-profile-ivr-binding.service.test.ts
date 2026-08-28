import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profileFindFirst: vi.fn(),
  versionFindFirst: vi.fn(),
  profileUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboundProfile: {
      findFirst: mocks.profileFindFirst,
      update: mocks.profileUpdate,
    },
    iVRFlowVersion: {
      findFirst: mocks.versionFindFirst,
    },
  },
}));

import { bindInboundProfileIvrFlow } from "@/services/ivr/inbound-profile-ivr-binding.service";

const actor = {
  id: "admin-a",
  role: UserRole.ADMIN,
  tenantId: "tenant-a",
};

describe("inbound profile IVR binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFindFirst.mockResolvedValue({ id: "profile-a", tenantId: "tenant-a" });
    mocks.versionFindFirst.mockResolvedValue({
      id: "version-2",
      flowId: "flow-a",
      versionNumber: 2,
      flow: { id: "flow-a", name: "Inbound v2", tenantId: "tenant-a" },
    });
  });

  it("binds the exact same-tenant published version", async () => {
    mocks.profileUpdate.mockResolvedValue({});

    const result = await bindInboundProfileIvrFlow({
      inboundProfileId: "profile-a",
      ivrFlowId: "flow-a",
      ivrFlowVersionId: "version-2",
      actor,
    });

    expect(result).toMatchObject({
      inboundProfileId: "profile-a",
      ivrFlowId: "flow-a",
      ivrFlowVersionId: "version-2",
      version: 2,
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-a" },
      data: { ivrFlowId: "flow-a", ivrFlowVersionId: "version-2" },
    });
  });

  it("rejects a tampered cross-tenant profile target", async () => {
    mocks.profileFindFirst.mockResolvedValue(null);

    await expect(bindInboundProfileIvrFlow({
      inboundProfileId: "profile-b",
      ivrFlowId: "flow-a",
      ivrFlowVersionId: "version-2",
      actor,
    })).rejects.toThrow("Inbound profile not found");
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("rejects a version that is not published for the profile tenant", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);

    await expect(bindInboundProfileIvrFlow({
      inboundProfileId: "profile-a",
      ivrFlowId: "flow-b",
      ivrFlowVersionId: "version-b",
      actor,
    })).rejects.toThrow("Selected published IVR version is not available");
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
});
