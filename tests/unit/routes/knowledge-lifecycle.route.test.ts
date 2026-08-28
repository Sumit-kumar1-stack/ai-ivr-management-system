import { NextRequest, NextResponse } from "next/server";
import { ConflictError } from "@/lib/app-error";

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignCapability: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  archiveKnowledgeDocument: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCampaignCapability: mocks.requireCampaignCapability,
}));

vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.createAuthErrorResponse,
}));

vi.mock("@/services/knowledge/knowledge-document.service", () => ({
  archiveKnowledgeDocument: mocks.archiveKnowledgeDocument,
  deleteKnowledgeDocument: mocks.deleteKnowledgeDocument,
}));

import { POST as archiveDocument } from "@/app/api/knowledge/[id]/archive/route";
import { DELETE as deleteDocument } from "@/app/api/knowledge/[id]/route";

describe("knowledge lifecycle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createAuthErrorResponse.mockReturnValue(
      NextResponse.json(
        {
          success: false,
          message: "Forbidden",
        },
        { status: 403 }
      )
    );
  });

  it("blocks non-mutating roles from archiving a document", async () => {
    mocks.requireCampaignCapability.mockRejectedValueOnce(new Error("forbidden"));

    const response = await archiveDocument(
      new NextRequest("https://example.com/api/knowledge/doc-1/archive", { method: "POST" }),
      {
        params: Promise.resolve({ id: "doc-1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.archiveKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("blocks non-mutating roles from deleting a document", async () => {
    mocks.requireCampaignCapability.mockRejectedValueOnce(new Error("forbidden"));

    const response = await deleteDocument(
      new NextRequest("https://example.com/api/knowledge/doc-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ id: "doc-1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("returns a controlled conflict for a protected knowledge dependency", async () => {
    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.requireCampaignCapability.mockResolvedValue({ id: "creator", role: "ADMIN", tenantId: "tenant-1" });
    mocks.deleteKnowledgeDocument.mockRejectedValue(new ConflictError(
      "This knowledge document is referenced by active or historical resources and cannot be deleted.",
      "KNOWLEDGE_DOCUMENT_DEPENDENCY_CONFLICT"
    ));

    const response = await deleteDocument(
      new NextRequest("https://example.com/api/knowledge/doc-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "doc-1" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ success: false, message: "This knowledge document is referenced by active or historical resources and cannot be deleted." });
  });
});
