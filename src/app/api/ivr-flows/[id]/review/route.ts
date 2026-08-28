import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IVRFlowService } from "@/services/ivr-flow.service";
import { buildIVRBuilderCatalogForTenant, toIVRFlowResourceAuthorization } from "@/services/ivr/ivr-builder-catalog.service";
import { buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { buildIvrFlowReviewSummary } from "@/services/ivr/ivr-flow-review.service";
import { simulateIVRFlow } from "@/services/ivr/ivr-simulator.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

export const GET = asyncHandler(
  async (
    _request: NextRequest,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { id } = await params;

    await assertIvrFlowOwnership(id, currentUser);

    const flow = await IVRFlowService.findById(id);
    if (!flow) {
      throw new Error("IVR flow not found.");
    }

    const publishedVersion = await IVRFlowService.findPublishedVersion(id);
    const catalog = await buildIVRBuilderCatalogForTenant(flow.tenantId ?? "");
    const validationResult = await IVRFlowService.validateForPublish(id, toIVRFlowResourceAuthorization(catalog));
    const simulation = simulateIVRFlow({
      nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
      edges: Array.isArray(flow.edges) ? flow.edges : [],
      inputMode: "SILENCE",
      input: "",
      tenantId: flow.tenantId ?? null,
    });

    const usage = await prisma.inboundProfile.findMany({
      where: {
        tenantId: flow.tenantId ?? "",
        ivrFlowId: id,
      },
      select: {
        id: true,
        name: true,
        active: true,
        voiceRuntime: true,
        ivrFlowVersionId: true,
        numbers: {
          where: { active: true },
          select: { provider: true, providerNumber: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const review = buildIvrFlowReviewSummary({
      currentFlow: {
        name: flow.name,
        version: flow.version,
        nodes: Array.isArray(flow.nodes) ? (flow.nodes as never) : [],
        edges: Array.isArray(flow.edges) ? (flow.edges as never) : [],
      },
      publishedVersion: publishedVersion
        ? {
            versionNumber: publishedVersion.versionNumber,
            nodes: Array.isArray(publishedVersion.nodes) ? (publishedVersion.nodes as never) : [],
            edges: Array.isArray(publishedVersion.edges) ? (publishedVersion.edges as never) : [],
          }
        : null,
      validation: validationResult.validation,
      simulation,
      inboundProfiles: usage.map(profile => {
        const number = profile.numbers[0];
        return {
          id: profile.id,
          name: profile.name,
          active: profile.active,
          provider: number?.provider ?? null,
          inboundNumberMasked: number ? maskInboundNumber(number.providerNumber) : null,
          voiceRuntime: profile.voiceRuntime,
          ivrFlowVersionId: profile.ivrFlowVersionId,
        };
      }),
    });

    return success({
      flow: {
        ...flow,
        permissions: buildIvrFlowPermissions(currentUser, flow),
      },
      publishedVersion,
      validation: validationResult.validation,
      simulation,
      usage,
      review,
    });
  }
);

function maskInboundNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) {
    return "••••";
  }

  return `${value.trim().startsWith("+") ? "+" : ""}${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}
