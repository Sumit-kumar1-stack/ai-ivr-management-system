import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { asyncHandler } from "@/lib/async-handler";
import { prisma } from "@/lib/prisma";
import { assertCommunicationCampaignAccess } from "@/services/communication/communication-campaign.service";
import { listCommunicationCampaignActions } from "@/services/communication/campaign-action-resolver.service";
import {
  buildFlowCopilotSuggestion,
  FlowCopilotModeSchema,
} from "@/services/ivr/flow-copilot.service";

const ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

const CopilotRequestSchema = z.object({
  mode: FlowCopilotModeSchema,
  prompt: z.string().trim().min(1).max(10_000),
  flowName: z.string().trim().min(1).max(120),
  campaignId: z.string().trim().min(1).optional().nullable(),
  currentFlow: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
});

export const POST = asyncHandler(async (request: NextRequest) => {
  try {
    const currentUser = await requireRole(ROLES);
    const body = CopilotRequestSchema.parse(await request.json());

    let knowledgeDocuments: Array<{
      id: string;
      name: string;
      status: string;
      indexed: boolean;
    }> = [];

    let availableActions: string[] = [];

    if (body.campaignId) {
      await assertCommunicationCampaignAccess(body.campaignId, currentUser);

      const campaign = await prisma.communicationCampaign.findUnique({
        where: { id: body.campaignId },
        select: {
          knowledgeDocumentIds: true,
        },
      });

      const knowledgeDocumentIds = Array.isArray(campaign?.knowledgeDocumentIds)
        ? (campaign.knowledgeDocumentIds as string[])
        : [];

      if (knowledgeDocumentIds.length) {
        knowledgeDocuments = await prisma.knowledgeDocument
          .findMany({
            where: {
              id: {
                in: knowledgeDocumentIds,
              },
              ...(currentUser.role === UserRole.SUPER_ADMIN
                ? {}
                : {
                    ownerUserId: currentUser.id,
                  }),
            },
            select: {
              id: true,
              originalName: true,
              status: true,
              _count: {
                select: {
                  chunks: true,
                },
              },
            },
          })
          .then(documents =>
            documents.map(document => ({
              id: document.id,
              name: document.originalName,
              status: document.status,
              indexed: document._count.chunks > 0,
            }))
          );
      }

      const actions = await listCommunicationCampaignActions(body.campaignId);
      availableActions = actions.map(action => action.actionCode);
    }

    const suggestion = await buildFlowCopilotSuggestion({
      mode: body.mode,
      prompt: body.prompt,
      flowName: body.flowName,
      currentFlow: {
        nodes: body.currentFlow.nodes as never,
        edges: body.currentFlow.edges as never,
      },
      supportedNodeKinds: [
        "START",
        "GREETING",
        "AI",
        "ACTION",
        "CONDITION",
        "DTMF_MENU",
        "TRANSFER",
        "END_CALL",
      ],
      availableActions,
      transferDestinations: [],
      knowledgeDocuments,
    });

    return NextResponse.json(
      {
        success: true,
        data: suggestion,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid IVR flow copilot request",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("IVR flow copilot failed", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "IVR flow copilot could not respond",
      },
      { status: 500 }
    );
  }
});
