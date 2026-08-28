import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assertIvrFlowOwnership: vi.fn(),
  findById: vi.fn(),
  recordValidation: vi.fn(),
  buildCatalog: vi.fn(),
  toAuthorization: vi.fn(),
  buildPermissions: vi.fn(),
  assertPermission: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/services/security/tenant-access.service", () => ({
  assertIvrFlowOwnership: mocks.assertIvrFlowOwnership,
}));

vi.mock("@/services/ivr-flow.service", () => ({
  IVRFlowService: {
    findById: mocks.findById,
    recordValidation: mocks.recordValidation,
  },
}));

vi.mock("@/services/ivr/ivr-builder-catalog.service", () => ({
  buildIVRBuilderCatalogForTenant: mocks.buildCatalog,
  toIVRFlowResourceAuthorization: mocks.toAuthorization,
}));

vi.mock("@/services/ivr/ivr-flow-permissions", () => ({
  buildIvrFlowPermissions: mocks.buildPermissions,
  assertIvrFlowPermission: mocks.assertPermission,
}));

vi.mock("@/services/audit/audit-event.service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { GET } from "@/app/api/ivr-flows/[id]/validate/route";

describe("IVR flow validate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
    });
    mocks.assertIvrFlowOwnership.mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue({
      id: "flow-a",
      tenantId: "tenant-a",
      lifecycle: "DRAFT",
      validationStatus: "NOT_VALIDATED",
      nodes: [{ id: "start" }, { id: "end" }],
      edges: [{ source: "start", target: "end" }],
    });
    mocks.buildCatalog.mockResolvedValue({ actions: [], campaigns: [], transferDestinations: [], knowledgeDocuments: [] });
    mocks.toAuthorization.mockReturnValue({});
    mocks.buildPermissions.mockReturnValue({ canValidate: true });
    mocks.recordValidation.mockResolvedValue({
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        issues: [
          { severity: "INFO" },
        ],
      },
    });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("records a safe builder validation audit event", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/ivr-flows/flow-a/validate"),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "ivr.builder.validated",
      metadata: {
        valid: true,
        errorCount: 0,
        warningCount: 0,
        infoCount: 1,
        nodeCount: 2,
        edgeCount: 1,
      },
    }));
  });
});
