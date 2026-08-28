import { IVRFlowLifecycle, IVRFlowVersionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignCount: vi.fn(),
  communicationCampaigns: vi.fn(),
  flows: vi.fn(),
  versions: vi.fn(),
  inboundProfiles: vi.fn(),
  callCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaignKnowledgeDocument: { count: mocks.campaignCount },
    communicationCampaign: { findMany: mocks.communicationCampaigns },
    iVRFlow: { findMany: mocks.flows },
    iVRFlowVersion: { findMany: mocks.versions },
    inboundProfile: { findMany: mocks.inboundProfiles },
    call: { count: mocks.callCount },
  },
}));

import { getKnowledgeDocumentDependencySummary } from "@/services/knowledge/knowledge-document-dependencies.service";

describe("knowledge document dependency governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignCount.mockResolvedValue(0);
    mocks.communicationCampaigns.mockResolvedValue([]);
    mocks.flows.mockResolvedValue([]);
    mocks.versions.mockResolvedValue([]);
    mocks.inboundProfiles.mockResolvedValue([]);
    mocks.callCount.mockResolvedValue(0);
  });

  it("allows deletion only for an unreferenced document", async () => {
    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ deleteAllowed: true, isReferenced: false });
  });

  it("detects campaign references", async () => {
    mocks.campaignCount.mockResolvedValue(1);
    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ campaignCount: 1, deleteAllowed: false, deleteBlockReason: "Referenced by 1 campaign" });
  });

  it("detects draft IVR graph references", async () => {
    mocks.flows.mockResolvedValue([{ id: "flow-1", lifecycle: IVRFlowLifecycle.DRAFT, nodes: [{ data: { knowledgeDocumentIds: ["doc-1"] } }] }]);
    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ ivrFlowCount: 1, deleteAllowed: false, deleteBlockReason: "Used by an IVR flow" });
  });

  it("protects metadata for a legacy published flow even before a version snapshot is discovered", async () => {
    mocks.flows.mockResolvedValue([{ id: "flow-legacy", lifecycle: IVRFlowLifecycle.PUBLISHED, nodes: [{ data: { knowledgeDocumentIds: ["doc-1"] } }] }]);
    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ deleteAllowed: false, editAllowed: false });
  });

  it("detects DemoBank-style published and applied IVR dependencies", async () => {
    mocks.versions.mockResolvedValue([{ id: "version-1", flowId: "flow-1", status: IVRFlowVersionStatus.PUBLISHED, nodes: [{ data: { knowledgeDocumentIds: ["doc-1"] } }] }]);
    mocks.inboundProfiles.mockResolvedValue([{ id: "plivo-inbound", active: true, ivrFlowId: "flow-1", ivrFlowVersionId: "version-1", knowledgeDocumentIds: [] }]);
    mocks.callCount.mockResolvedValue(3);

    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ publishedIvrVersionCount: 1, liveDeploymentCount: 1, runtimeCallCount: 3, deleteAllowed: false, editAllowed: false, deleteBlockReason: "Used by a live inbound flow" });
  });

  it("recognizes direct inbound-profile knowledge scope dependencies", async () => {
    mocks.inboundProfiles.mockResolvedValue([{ id: "profile-1", active: true, ivrFlowId: null, ivrFlowVersionId: null, knowledgeDocumentIds: ["doc-1"] }]);
    await expect(getKnowledgeDocumentDependencySummary("doc-1")).resolves.toMatchObject({ inboundProfileScopeCount: 1, liveDeploymentCount: 1, deleteAllowed: false });
  });
});
