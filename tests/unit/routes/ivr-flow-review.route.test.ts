import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assertIvrFlowOwnership: vi.fn(),
  findById: vi.fn(),
  findPublishedVersion: vi.fn(),
  validateForPublish: vi.fn(),
  buildCatalog: vi.fn(),
  toAuthorization: vi.fn(),
  buildPermissions: vi.fn(),
  findInboundProfiles: vi.fn(),
  buildReviewSummary: vi.fn(),
  simulate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/services/security/tenant-access.service", () => ({
  assertIvrFlowOwnership: mocks.assertIvrFlowOwnership,
}));
vi.mock("@/services/ivr-flow.service", () => ({
  IVRFlowService: {
    findById: mocks.findById,
    findPublishedVersion: mocks.findPublishedVersion,
    validateForPublish: mocks.validateForPublish,
  },
}));
vi.mock("@/services/ivr/ivr-builder-catalog.service", () => ({
  buildIVRBuilderCatalogForTenant: mocks.buildCatalog,
  toIVRFlowResourceAuthorization: mocks.toAuthorization,
}));
vi.mock("@/services/ivr/ivr-flow-permissions", () => ({
  buildIvrFlowPermissions: mocks.buildPermissions,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboundProfile: {
      findMany: mocks.findInboundProfiles,
    },
  },
}));
vi.mock("@/services/ivr/ivr-flow-review.service", () => ({
  buildIvrFlowReviewSummary: mocks.buildReviewSummary,
}));
vi.mock("@/services/ivr/ivr-simulator.service", () => ({
  simulateIVRFlow: mocks.simulate,
}));

import { GET } from "@/app/api/ivr-flows/[id]/review/route";

describe("IVR flow review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "admin-1", role: UserRole.ADMIN, tenantId: "tenant-a" });
    mocks.assertIvrFlowOwnership.mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue({
      id: "flow-a",
      tenantId: "tenant-a",
      name: "Loan flow",
      version: 7,
      lifecycle: "PENDING_APPROVAL",
      validationStatus: "VALID",
      nodes: [{ id: "start" }],
      edges: [],
      submittedAt: null,
      updatedAt: "2026-08-28T00:00:00.000Z",
    });
    mocks.findPublishedVersion.mockResolvedValue({
      id: "version-a",
      versionNumber: 6,
      nodes: [{ id: "start" }],
      edges: [],
      publishedAt: "2026-08-27T00:00:00.000Z",
      validationStatus: "VALID",
    });
    mocks.buildCatalog.mockResolvedValue({ actions: [], campaigns: [], transferDestinations: [], knowledgeDocuments: [], warnings: [] });
    mocks.toAuthorization.mockReturnValue({});
    mocks.validateForPublish.mockResolvedValue({
      validation: { valid: true, errors: [], warnings: [], issues: [] },
    });
    mocks.simulate.mockReturnValue({
      validation: { valid: true },
      currentNodeId: "start",
      resultingNodeId: "start",
      transition: "DEFAULT",
      responsePreview: "Preview",
      knowledgeScopeSummary: null,
      warnings: [],
      trace: [],
    });
    mocks.findInboundProfiles.mockResolvedValue([
      {
        id: "profile-1",
        name: "Main IVR",
        active: true,
        voiceRuntime: "STANDARD",
        ivrFlowVersionId: "version-a",
        numbers: [{ provider: "Plivo", providerNumber: "+15551234567" }],
      },
    ]);
    mocks.buildPermissions.mockReturnValue({ canApprove: true, canReject: true });
    mocks.buildReviewSummary.mockReturnValue({
      versionLabel: "v7",
      publishedVersionLabel: "v6",
      noMaterialChanges: false,
      submissionSummary: "1 node change(s) and 0 edge change(s) relative to v6.",
      nodeChanges: [{ title: "Updated node Start", detail: "Runtime mode changed.", tone: "warning", nodeId: "start" }],
      edgeChanges: [],
      structureFindings: [],
      runtimeFindings: [],
      knowledgeFindings: [],
      toolFindings: [],
      authFindings: [],
      transferFindings: [],
      callbackFindings: [],
      validationFindings: [],
      simulationFindings: [],
      usageFindings: [],
    });
  });

  it("returns a safe review payload for a tenant-scoped flow", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/ivr-flows/flow-a/review"),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.review.submissionSummary).toContain("relative to v6");
    expect(payload.data.flow.permissions).toMatchObject({ canApprove: true, canReject: true });
    expect(mocks.findInboundProfiles).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", ivrFlowId: "flow-a" }),
    }));
    expect(mocks.validateForPublish).toHaveBeenCalled();
    expect(mocks.simulate).toHaveBeenCalled();
  });
});
