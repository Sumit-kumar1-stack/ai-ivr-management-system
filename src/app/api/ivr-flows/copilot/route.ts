import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { AppError } from "@/lib/app-error";
import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { asyncHandler } from "@/lib/async-handler";
import { createLogger } from "@/lib/logger";
import {
  resolveIVRBuilderContext,
  toIVRFlowResourceAuthorization,
} from "@/services/ivr/ivr-builder-catalog.service";
import {
  buildFlowCopilotSuggestion,
  FlowCopilotModeSchema,
} from "@/services/ivr/flow-copilot.service";

const ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;
const log = createLogger({ component: "ivr-flow-copilot-route" });

const CopilotRequestSchema = z.object({
  mode: FlowCopilotModeSchema,
  prompt: z.string().trim().min(1).max(10_000),
  flowName: z.string().trim().min(1).max(120),
  campaignId: z.string().trim().min(1).optional().nullable(),
  inboundProfileId: z.string().trim().min(1).optional().nullable(),
  returnTo: z.string().trim().optional().nullable(),
  currentFlow: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
});

export const POST = asyncHandler(async (request: NextRequest) => {
  try {
    const currentUser = await requireRole(ROLES);
    const body = CopilotRequestSchema.parse(await request.json());
    log.info({
      event: "ivr.copilot.request_received",
      command: body.mode,
      inboundProfileId: body.inboundProfileId ?? null,
      currentNodeCount: body.currentFlow.nodes.length,
      currentEdgeCount: body.currentFlow.edges.length,
    }, "IVR copilot request received");
    const builderContext = await resolveIVRBuilderContext(currentUser, {
      campaignId: body.campaignId,
      inboundProfileId: body.inboundProfileId,
      returnTo: body.returnTo,
    });

    const suggestion = await buildFlowCopilotSuggestion({
      mode: body.mode,
      prompt: body.prompt,
      flowName: body.flowName,
      currentFlow: {
        nodes: body.currentFlow.nodes as never,
        edges: body.currentFlow.edges as never,
      },
      validation: undefined,
      supportedNodeKinds: builderContext.catalog.supportedNodeKinds,
      availableActions: builderContext.catalog.actions.map(action => action.actionCode),
      transferDestinations: builderContext.catalog.transferDestinations.map(destination => ({
        id: destination.id,
        label: destination.label,
      })),
      knowledgeDocuments: builderContext.catalog.knowledgeDocuments,
      approvedMessageTemplates: builderContext.catalog.approvedMessageTemplates,
      inboundProfiles: builderContext.catalog.inboundProfiles.map(profile => ({
        id: profile.id,
        label: profile.label,
        active: profile.active,
      })),
      campaigns: builderContext.catalog.campaigns.map(campaign => ({
        id: campaign.id,
        label: campaign.label,
        status: campaign.status,
      })),
      resourceWarnings: builderContext.catalog.warnings,
      resourceAuthorization: toIVRFlowResourceAuthorization(builderContext.catalog),
    });

    log.info({
      event: "ivr.copilot.response_ready",
      command: body.mode,
      inboundProfileId: body.inboundProfileId ?? null,
      candidateNodeCount: suggestion.candidateFlow?.nodes.length ?? 0,
      candidateEdgeCount: suggestion.candidateFlow?.edges.length ?? 0,
      deterministicValidationValid: suggestion.validation?.valid ?? null,
      deterministicValidationErrorCodes: suggestion.validation?.errors.map(issue => issue.code) ?? [],
      missingResourceCount: suggestion.missingResources.length,
      finalHttpStatus: 200,
    }, "IVR copilot response ready");

    return NextResponse.json(
      {
        success: true,
        data: suggestion,
        meta: {
          targetContext: builderContext.target,
        },
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
      log.warn({ event: "ivr.copilot.request_invalid", finalHttpStatus: 422 }, "IVR copilot request did not match its contract");
      return NextResponse.json(
        {
          success: false,
          message: "Invalid IVR flow copilot request",
          code: "COPILOT_INVALID_REQUEST",
          issues: error.issues,
        },
        { status: 422 }
      );
    }

    if (error instanceof AppError) {
      log.warn({
        event: "ivr.copilot.request_rejected",
        applicationErrorCode: error.code,
        finalHttpStatus: error.statusCode,
      }, "IVR copilot request rejected");
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.statusCode }
      );
    }

    log.error({
      event: "ivr.copilot.request_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      finalHttpStatus: 500,
    }, "IVR copilot failed unexpectedly");

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
