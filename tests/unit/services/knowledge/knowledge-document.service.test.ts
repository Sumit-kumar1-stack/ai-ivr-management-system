import { KnowledgeDocumentStatus, UserRole } from "@prisma/client";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  getDependencySummary: vi.fn(),
  assertOwnership: vi.fn(),
}));

vi.mock("@/services/knowledge/knowledge-document-dependencies.service", () => ({
  getKnowledgeDocumentDependencySummary: mocks.getDependencySummary,
}));

vi.mock("@/services/security/tenant-access.service", () => ({
  assertKnowledgeDocumentOwnership: mocks.assertOwnership,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeDocument: {
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
      update: mocks.update,
      delete: mocks.delete,
    },
    campaignKnowledgeDocument: {
      count: mocks.count,
    },
  },
}));

import { AppEvent, EventPublisher } from "@/core/events";
import {
  archiveKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/services/knowledge/knowledge-document.service";

const adminUser = {
  id: "user-1",
  role: UserRole.ADMIN,
  tenantId: "tenant-1",
} as const;

const superAdminUser = {
  id: "user-2",
  role: UserRole.SUPER_ADMIN,
  tenantId: null,
} as const;

describe("knowledge document lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(EventPublisher, "publish").mockResolvedValue(true);
    mocks.assertOwnership.mockResolvedValue(undefined);
    mocks.getDependencySummary.mockResolvedValue({
      campaignCount: 0, ivrFlowCount: 0, ivrVersionCount: 0, publishedIvrVersionCount: 0,
      inboundProfileScopeCount: 0, liveDeploymentCount: 0, runtimeCallCount: 0,
      isReferenced: false, deleteAllowed: true, editAllowed: true, deleteBlockReason: null,
    });
  });

  it("scopes knowledge document listings to the authenticated owner", async () => {
    mocks.findMany.mockResolvedValue([]);

    await listKnowledgeDocuments(adminUser, "policy");

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUser: {
            tenantId: "tenant-1",
          },
          originalName: {
            contains: "policy",
            mode: "insensitive",
          },
        },
      })
    );
  });

  it("allows super admins to list without an owner filter", async () => {
    mocks.findMany.mockResolvedValue([]);

    await listKnowledgeDocuments(superAdminUser, null);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it("archives a document and emits the archive audit event", async () => {
    const document = {
      id: "doc-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: KnowledgeDocumentStatus.ACTIVE,
      path: "/tmp/doc-1.pdf",
    };

    mocks.findFirst.mockResolvedValue(document);
    mocks.update.mockResolvedValue({
      ...document,
      status: KnowledgeDocumentStatus.ARCHIVED,
      archivedAt: new Date("2026-08-21T10:00:00.000Z"),
    });

    await archiveKnowledgeDocument("doc-1", adminUser);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: KnowledgeDocumentStatus.ARCHIVED,
          archivedAt: expect.any(Date),
        }),
      })
    );

    expect(EventPublisher.publish).toHaveBeenCalledWith(
      AppEvent.KNOWLEDGE_DOCUMENT_ARCHIVED,
      expect.objectContaining({
        documentId: "doc-1",
        ownerUserId: "user-1",
        status: KnowledgeDocumentStatus.ARCHIVED,
      })
    );
  });

  it("blocks permanent deletion when dependency governance detects campaign references", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "doc-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: KnowledgeDocumentStatus.ARCHIVED,
      path: "/tmp/doc-1.pdf",
    });
    mocks.getDependencySummary.mockResolvedValue({
      campaignCount: 1, ivrFlowCount: 0, ivrVersionCount: 0, publishedIvrVersionCount: 0,
      inboundProfileScopeCount: 0, liveDeploymentCount: 0, runtimeCallCount: 0,
      isReferenced: true, deleteAllowed: false, editAllowed: true, deleteBlockReason: "Referenced by 1 campaign",
    });

    await expect(deleteKnowledgeDocument("doc-1", adminUser)).rejects.toThrow(
      "This knowledge document is referenced by active or historical resources and cannot be deleted."
    );

    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("allows an authorized user to delete an unreferenced active document", async () => {
    mocks.findFirst.mockResolvedValue({ id: "doc-1", ownerUserId: "user-1", status: KnowledgeDocumentStatus.ACTIVE, path: "knowledge/tenant-1/doc.pdf" });
    mocks.delete.mockResolvedValue({ id: "doc-1", ownerUserId: "user-1", status: KnowledgeDocumentStatus.ACTIVE });

    await expect(deleteKnowledgeDocument("doc-1", adminUser)).resolves.toMatchObject({ id: "doc-1" });
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } });
  });

  it("does not disclose or delete a document outside the caller's tenant", async () => {
    mocks.assertOwnership.mockRejectedValue(new Error("Knowledge document not found"));

    await expect(deleteKnowledgeDocument("other-tenant-doc", adminUser)).rejects.toThrow("Knowledge document not found");
    expect(mocks.getDependencySummary).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
