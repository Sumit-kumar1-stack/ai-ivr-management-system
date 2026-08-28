import { describe, expect, it } from "vitest";
import { resolveInboundKnowledgeDocumentIds } from "@/services/knowledge/inbound-knowledge-scope.service";

const publishedVersion = {
  tenantId: "tenant-a",
  status: "PUBLISHED",
  nodes: [
    { data: { nodeKind: "AI_CONVERSATION", knowledgeDocumentIds: ["demo-loan-kb"] } },
    { data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["personal-loan-kb"] } },
  ],
};

describe("inbound knowledge scope", () => {
  it("uses the published inbound IVR bindings when the profile has no direct allowlist", () => {
    expect(resolveInboundKnowledgeDocumentIds({ tenantId: "tenant-a", profileKnowledgeDocumentIds: [], ivrFlowVersion: publishedVersion })).toEqual(["demo-loan-kb", "personal-loan-kb"]);
  });

  it("preserves an explicit inbound-profile allowlist", () => {
    expect(resolveInboundKnowledgeDocumentIds({ tenantId: "tenant-a", profileKnowledgeDocumentIds: ["profile-kb"], ivrFlowVersion: publishedVersion })).toEqual(["profile-kb"]);
  });

  it("rejects a cross-tenant published version", () => {
    expect(resolveInboundKnowledgeDocumentIds({ tenantId: "tenant-b", profileKnowledgeDocumentIds: [], ivrFlowVersion: publishedVersion })).toEqual([]);
  });
});
