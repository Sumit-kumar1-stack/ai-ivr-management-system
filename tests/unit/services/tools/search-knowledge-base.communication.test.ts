import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  retrieveKnowledge: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { call: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: vi.fn() }) }));
vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));

import { searchKnowledgeBaseTool } from "@/services/tools/search-knowledge-base.tool";

describe("searchKnowledgeBase communication-campaign scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      id: "call-a",
      campaignId: null,
      direction: "OUTBOUND",
      tenantId: "tenant-a",
      authenticationLevel: "AUTH_LEVEL_0",
      inboundProfile: null,
      ivrFlowVersion: null,
      campaign: null,
      communicationCampaign: {
        knowledgeDocumentIds: ["loan-kb"],
        ownerUserId: "campaign-owner",
        ownerUser: { tenantId: "tenant-a" },
      },
    });
  });

  it("uses selected same-tenant documents without requiring uploader ownership", async () => {
    mocks.retrieveKnowledge.mockResolvedValue([
      {
        content: "Personal loan eligibility depends on income and credit profile.",
        documentId: "loan-kb",
        chunkIndex: 0,
        score: 1,
        classification: "INTERNAL",
      },
    ]);

    const result = await searchKnowledgeBaseTool.handler(
      { query: "What are the personal loan eligibility requirements?" },
      { callId: "call-a", signal: new AbortController().signal } as never
    ) as { found: boolean; chunks: unknown[] };

    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What are the personal loan eligibility requirements?",
      5,
      expect.objectContaining({
        knowledgeDocumentIds: ["loan-kb"],
        tenantId: "tenant-a",
        ownerUserId: null,
        callAuthenticationLevel: "AUTH_LEVEL_0",
      })
    );

    expect(result).toMatchObject({
      found: true,
      chunks: [expect.objectContaining({ documentId: "loan-kb" })],
    });
  });
});
