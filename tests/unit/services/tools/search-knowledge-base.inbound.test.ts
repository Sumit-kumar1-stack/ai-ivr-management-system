import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  retrieveKnowledge: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { call: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: vi.fn() }) }));
vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));

import { searchKnowledgeBaseTool } from "@/services/tools/search-knowledge-base.tool";

describe("searchKnowledgeBase inbound scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      id: "call-a",
      campaignId: "inbound-campaign",
      direction: "INBOUND",
      tenantId: "tenant-a",
      authenticationLevel: "AUTH_LEVEL_0",
      inboundProfile: { knowledgeDocumentIds: [] },
      ivrFlowVersion: { tenantId: "tenant-a", status: "PUBLISHED", nodes: [{ data: { nodeKind: "AI_CONVERSATION", knowledgeDocumentIds: ["demo-loan-kb"] } }] },
      campaign: { ownerUserId: null, ownerUser: null },
    });
  });

  it("retrieves chunks from the published inbound IVR scope when the profile list is empty", async () => {
    mocks.retrieveKnowledge.mockResolvedValue([{ content: "Personal loan rates start at 10%.", documentId: "demo-loan-kb", chunkIndex: 0, score: 1, classification: "PUBLIC_PRODUCT_INFO" }]);
    const result = await searchKnowledgeBaseTool.handler({ query: "What is the personal loan rate?" }, { callId: "call-a", signal: new AbortController().signal } as never) as { found: boolean; chunks: unknown[] };

    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith("What is the personal loan rate?", 5, expect.objectContaining({ knowledgeDocumentIds: ["demo-loan-kb"], tenantId: "tenant-a" }));
    expect(result).toMatchObject({ found: true, chunks: [expect.objectContaining({ documentId: "demo-loan-kb" })] });
  });

  it("does not use a published IVR version from another tenant", async () => {
    mocks.findUnique.mockResolvedValue({ ...(await mocks.findUnique()), ivrFlowVersion: { tenantId: "tenant-b", status: "PUBLISHED", nodes: [{ data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["tenant-b-kb"] } }] } });
    mocks.retrieveKnowledge.mockResolvedValue([]);
    await searchKnowledgeBaseTool.handler({ query: "What is the personal loan rate?" }, { callId: "call-a", signal: new AbortController().signal } as never);

    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 5, expect.objectContaining({ knowledgeDocumentIds: [] }));
  });
});
