import { NextRequest, NextResponse } from "next/server";

import { requireCampaignCapability } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { archiveKnowledgeDocument } from "@/services/knowledge/knowledge-document.service";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await requireCampaignCapability("CAMPAIGN_EDIT");
    const { id } = await context.params;

    const document = await archiveKnowledgeDocument(id, currentUser);

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    const message =
      error instanceof Error ? error.message : "Knowledge document could not be archived";

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
