import { NextRequest, NextResponse } from "next/server";

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  archiveKnowledgeDocument: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
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
    mocks.requireRole.mockRejectedValueOnce(new Error("forbidden"));

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
    mocks.requireRole.mockRejectedValueOnce(new Error("forbidden"));

    const response = await deleteDocument(
      new NextRequest("https://example.com/api/knowledge/doc-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ id: "doc-1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });
});
