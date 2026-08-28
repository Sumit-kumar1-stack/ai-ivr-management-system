import fs from "node:fs/promises";
import path from "node:path";

import { AppEvent, EventPublisher } from "@/core/events";
import { prisma } from "@/lib/prisma";
import type { AuthenticatedUser } from "@/lib/auth";
import { UserRole, KnowledgeDocumentClassification, KnowledgeDocumentStatus } from "@prisma/client";
import { assertKnowledgeDocumentOwnership } from "@/services/security/tenant-access.service";

export type KnowledgeDocumentAccessUser = Pick<AuthenticatedUser, "id" | "role" | "tenantId">;

function canBypassOwnership(user: KnowledgeDocumentAccessUser): boolean {
  return user.role === UserRole.SUPER_ADMIN;
}

function buildOwnershipFilter(user: KnowledgeDocumentAccessUser) {
  return canBypassOwnership(user)
    ? {}
    : {
        ownerUser: {
          tenantId: user.tenantId ?? "",
        },
      };
}

async function resolveKnowledgeDocument(
  documentId: string,
  user: KnowledgeDocumentAccessUser
) {
  const id = documentId.trim();

  if (!id) {
    throw new Error("Knowledge document ID is required");
  }

  if (canBypassOwnership(user)) {
    return prisma.knowledgeDocument.findUnique({
      where: { id },
    });
  }

  await assertKnowledgeDocumentOwnership(id, user);

  return prisma.knowledgeDocument.findFirst({
    where: {
      id,
      ownerUser: {
        tenantId: user.tenantId ?? "",
      },
    },
  });
}

export async function listKnowledgeDocuments(
  user: KnowledgeDocumentAccessUser,
  search?: string | null
) {
  return prisma.knowledgeDocument.findMany({
    where: {
      ...buildOwnershipFilter(user),
      ...(search
        ? {
            originalName: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {}),
    },
    include: {
      chunks: true,
      campaignLinks: {
        select: {
          campaignId: true,
          campaign: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
      _count: {
        select: {
          campaignLinks: true,
          chunks: true,
        },
      },
    },
    orderBy: {
      uploadedAt: "desc",
    },
  });
}

export async function updateKnowledgeDocumentMetadata(
  documentId: string,
  user: KnowledgeDocumentAccessUser,
  input: {
    originalName?: string;
    classification?: KnowledgeDocumentClassification;
  }
) {
  const document = await resolveKnowledgeDocument(documentId, user);

  if (!document) {
    throw new Error("Knowledge document not found");
  }

  if (document.status === KnowledgeDocumentStatus.ARCHIVED && input.originalName) {
    // Archived documents can still be renamed, but keep the behavior explicit in the service.
  }

  return prisma.knowledgeDocument.update({
    where: {
      id: document.id,
    },
    data: {
      ...(input.originalName !== undefined
        ? {
            originalName: input.originalName.trim(),
          }
        : {}),
      ...(input.classification !== undefined
        ? {
            classification: input.classification,
          }
        : {}),
    },
  });
}

export async function archiveKnowledgeDocument(
  documentId: string,
  user: KnowledgeDocumentAccessUser
) {
  const document = await resolveKnowledgeDocument(documentId, user);

  if (!document) {
    throw new Error("Knowledge document not found");
  }

  if (document.status === KnowledgeDocumentStatus.ARCHIVED) {
    return document;
  }

  const archivedAt = new Date();

  const updated = await prisma.knowledgeDocument.update({
    where: {
      id: document.id,
    },
    data: {
      status: KnowledgeDocumentStatus.ARCHIVED,
      archivedAt,
    },
  });

  await EventPublisher.publish(AppEvent.KNOWLEDGE_DOCUMENT_ARCHIVED, {
    documentId: updated.id,
    ownerUserId: updated.ownerUserId,
    archivedAt: archivedAt.toISOString(),
    status: updated.status,
  });

  return updated;
}

export async function deleteKnowledgeDocument(
  documentId: string,
  user: KnowledgeDocumentAccessUser
) {
  const document = await resolveKnowledgeDocument(documentId, user);

  if (!document) {
    throw new Error("Knowledge document not found");
  }

  const attachedCount = await prisma.campaignKnowledgeDocument.count({
    where: {
      knowledgeDocumentId: document.id,
    },
  });

  if (attachedCount > 0) {
    throw new Error(
      "Knowledge document is still attached to one or more campaigns. Detach it before permanent deletion."
    );
  }

  if (document.status !== KnowledgeDocumentStatus.ARCHIVED) {
    throw new Error("Archive the knowledge document before permanent deletion.");
  }

  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      document.path.replace(/^\/+/, "")
    );

    await fs.unlink(filePath);
  } catch {
    // Best-effort cleanup. The database delete remains the source of truth.
  }

  const deleted = await prisma.knowledgeDocument.delete({
    where: {
      id: document.id,
    },
  });

  await EventPublisher.publish(AppEvent.KNOWLEDGE_DOCUMENT_DELETED, {
    documentId: deleted.id,
    ownerUserId: deleted.ownerUserId,
    status: deleted.status,
  });

  return deleted;
}
