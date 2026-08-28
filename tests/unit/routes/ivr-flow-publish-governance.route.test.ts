import { UserRole, IVRFlowLifecycle, IVRFlowValidationStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assertIvrFlowOwnership: vi.fn(),
  findById: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/services/security/tenant-access.service", () => ({
  assertIvrFlowOwnership: mocks.assertIvrFlowOwnership,
}));
vi.mock("@/services/ivr-flow.service", () => ({
  IVRFlowService: {
    findById: mocks.findById,
    publish: mocks.publish,
  },
}));

import { POST } from "@/app/api/ivr-flows/[id]/publish/route";

describe("IVR flow publish governance route", () => {
  it("returns a controlled conflict when a validated flow has not been approved", async () => {
    mocks.requireRole.mockResolvedValue({
      id: "maker",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
      campaignCapabilities: ["CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT", "IVR_PUBLISH"],
    });
    mocks.assertIvrFlowOwnership.mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue({
      id: "flow-a",
      tenantId: "tenant-a",
      ownerUserId: "maker",
      submittedByUserId: null,
      lifecycle: IVRFlowLifecycle.VALIDATED,
      validationStatus: IVRFlowValidationStatus.VALID,
    });

    const response = await POST(
      new NextRequest("https://example.test/api/ivr-flows/flow-a/publish", { method: "POST" }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "IVR_FLOW_NOT_APPROVED",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
