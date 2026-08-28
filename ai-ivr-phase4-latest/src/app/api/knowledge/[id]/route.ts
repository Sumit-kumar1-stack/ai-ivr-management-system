import { UserRole, KnowledgeDocumentClassification } from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import {
  deleteKnowledgeDocument,
  updateKnowledgeDocumentMetadata,
} from "@/services/knowledge/knowledge-document.service";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const MUTATION_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN] as const;

const KnowledgeUpdateSchema = z.object({
  originalName: z.string().trim().min(1).max(255).optional(),
  classification: z.nativeEnum(KnowledgeDocumentClassification).optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await requireRole(MUTATION_ROLES);
    const { id } = await context.params;
    const body = KnowledgeUpdateSchema.parse(await request.json());

    const document = await updateKnowledgeDocumentMetadata(id, currentUser, body);

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid knowledge document update",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Knowledge document could not be updated";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status: message.includes("not found") ? 404 : 400,
      }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await requireRole(MUTATION_ROLES);
    const { id } = await context.params;

    const deleted = await deleteKnowledgeDocument(id, currentUser);

    return NextResponse.json({
      success: true,
      data: {
        id: deleted.id,
      },
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    const message =
      error instanceof Error ? error.message : "Knowledge document could not be deleted";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : message.includes("attached")
              ? 409
              : message.includes("Archive the knowledge document")
                ? 409
                : 400,
      }
    );
  }
}
