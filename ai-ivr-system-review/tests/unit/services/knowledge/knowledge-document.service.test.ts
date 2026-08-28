import { KnowledgeDocumentStatus, UserRole } from "@prisma/client";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
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

  it("blocks permanent deletion while a document is still attached to campaigns", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "doc-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: KnowledgeDocumentStatus.ARCHIVED,
      path: "/tmp/doc-1.pdf",
    });
    mocks.count.mockResolvedValue(1);

    await expect(deleteKnowledgeDocument("doc-1", adminUser)).rejects.toThrow(
      "Knowledge document is still attached to one or more campaigns. Detach it before permanent deletion."
    );

    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
