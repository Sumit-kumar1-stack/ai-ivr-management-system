import { IVRFlowLifecycle, IVRFlowValidationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  normalize: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    iVRFlow: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

vi.mock("@/services/ivr/ivr-menu-routing.service", () => ({
  normalizeIVRMenuRouting: mocks.normalize,
}));

import { IVRFlowService } from "@/services/ivr-flow.service";

describe("published IVR edit safety", () => {
  it("creates the next mutable draft while preserving the published v1 snapshot", async () => {
    const publishedNodes = [{ id: "knowledge", data: { knowledgeDocumentIds: ["doc-live"] } }];
    mocks.findUnique.mockResolvedValue({
      id: "flow-1", name: "DemoBank Personal Loan - Plivo", description: null, campaignId: null,
      nodes: publishedNodes, edges: [], isPublished: true, version: 1, lifecycle: IVRFlowLifecycle.PUBLISHED,
      validationStatus: IVRFlowValidationStatus.VALID, updatedByUserId: "creator",
    });
    mocks.normalize.mockReturnValue({ nodes: [{ id: "knowledge", data: { knowledgeDocumentIds: ["doc-v2"] } }], edges: [] });
    mocks.update.mockResolvedValue({ id: "flow-1", version: 2, isPublished: false, lifecycle: IVRFlowLifecycle.DRAFT });

    await IVRFlowService.update("flow-1", {
      name: "DemoBank Personal Loan - Plivo",
      nodes: [{ id: "knowledge", data: { knowledgeDocumentIds: ["doc-v2"] } }],
      edges: [],
      updatedByUserId: "creator",
    });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "flow-1" },
      data: expect.objectContaining({
        version: 2,
        isPublished: false,
        lifecycle: IVRFlowLifecycle.DRAFT,
        validationStatus: IVRFlowValidationStatus.NOT_VALIDATED,
      }),
    }));
    expect(publishedNodes).toEqual([{ id: "knowledge", data: { knowledgeDocumentIds: ["doc-live"] } }]);
  });
});
