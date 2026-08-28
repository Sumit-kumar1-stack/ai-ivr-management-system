import { UserRole } from "@prisma/client";

import {
  createRateLimitResponse,
  ensureRateLimit,
  readClientAddress,
} from "@/lib/abuse-control";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listKnowledgeDocuments } from "@/services/knowledge/knowledge-document.service";
import type { KnowledgeDocumentSummary } from "@/features/knowledge/knowledge.types";

export async function GET(request: Request) {
  const currentUser = await requireRole([
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ]);

  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search");

  try {
    await ensureRateLimit({
      scope:
        "knowledge-lookup",

      limit:
        30,

      windowMs:
        60 *
        1000,

      keyParts: [
        currentUser.id,

        search ?? "",

        readClientAddress(
          request
        ),
      ],
    });
  } catch (error) {
    const rateLimitResponse =
      createRateLimitResponse(
        error
      );

    if (
      rateLimitResponse
    ) {
      return rateLimitResponse;
    }

    throw error;
  }

  const documents = await listKnowledgeDocuments(currentUser, search);

  return NextResponse.json({
    success: true,
    data: documents.map(
      document =>
        ({
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          size: document.size,
          path: document.path,
          classification: document.classification,
          status: document.status,
          uploadedAt: document.uploadedAt.toISOString(),
          archivedAt: document.archivedAt
            ? document.archivedAt.toISOString()
            : null,
          chunkCount: document._count.chunks,
          campaignCount: document._count.campaignLinks,
          isIndexed: document._count.chunks > 0,
          campaignNames: document.campaignLinks.map(link => ({
            id: link.campaign.id,
            name: link.campaign.name,
            status: link.campaign.status,
          })),
        } satisfies KnowledgeDocumentSummary)
    ),
  });
}
