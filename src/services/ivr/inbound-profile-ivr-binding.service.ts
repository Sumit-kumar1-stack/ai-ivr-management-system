import { IVRFlowVersionStatus, UserRole } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

type InboundProfileBindingActor = Pick<
  AuthenticatedUser,
  "id" | "role" | "tenantId"
>;

export async function bindInboundProfileIvrFlow(input: {
  inboundProfileId: string;
  ivrFlowId: string;
  ivrFlowVersionId: string;
  actor: InboundProfileBindingActor;
}) {
  const inboundProfileId = input.inboundProfileId.trim();
  const ivrFlowId = input.ivrFlowId.trim();
  const ivrFlowVersionId = input.ivrFlowVersionId.trim();

  if (!inboundProfileId || !ivrFlowId || !ivrFlowVersionId) {
    throw new ValidationError("Inbound profile, IVR flow, and published version are required");
  }

  const profile = await prisma.inboundProfile.findFirst({
    where: {
      id: inboundProfileId,
      ...(input.actor.role === UserRole.SUPER_ADMIN
        ? {}
        : { tenantId: input.actor.tenantId ?? "" }),
    },
    select: {
      id: true,
      tenantId: true,
      ivrFlowId: true,
      ivrFlowVersionId: true,
    },
  });

  if (!profile) {
    throw new NotFoundError("Inbound profile");
  }

  const version = await prisma.iVRFlowVersion.findFirst({
    where: {
      id: ivrFlowVersionId,
      flowId: ivrFlowId,
      tenantId: profile.tenantId,
      status: IVRFlowVersionStatus.PUBLISHED,
    },
    select: {
      id: true,
      flowId: true,
      versionNumber: true,
      flow: {
        select: {
          id: true,
          name: true,
          tenantId: true,
        },
      },
    },
  });

  if (!version || version.flow.tenantId !== profile.tenantId) {
    throw new ConflictError("Selected published IVR version is not available for this inbound profile", "IVR_VERSION_DEPLOYMENT_BLOCKED");
  }

  await prisma.inboundProfile.update({
    where: { id: profile.id },
    data: {
      ivrFlowId: version.flowId,
      ivrFlowVersionId: version.id,
    },
  });

  return {
    inboundProfileId: profile.id,
    tenantId: profile.tenantId,
    ivrFlowId: version.flowId,
    ivrFlowVersionId: version.id,
    flowName: version.flow.name,
    version: version.versionNumber,
    previousBinding: profile.ivrFlowId && profile.ivrFlowVersionId
      ? { ivrFlowId: profile.ivrFlowId, ivrFlowVersionId: profile.ivrFlowVersionId }
      : null,
  };
}

export async function unbindInboundProfileIvrFlow(input: {
  inboundProfileId: string;
  actor: InboundProfileBindingActor;
}) {
  const inboundProfileId = input.inboundProfileId.trim();
  if (!inboundProfileId) throw new ValidationError("Inbound profile is required");

  const profile = await prisma.inboundProfile.findFirst({
    where: {
      id: inboundProfileId,
      ...(input.actor.role === UserRole.SUPER_ADMIN
        ? {}
        : { tenantId: input.actor.tenantId ?? "" }),
    },
    select: {
      id: true,
      tenantId: true,
      ivrFlowId: true,
      ivrFlowVersionId: true,
    },
  });

  if (!profile) throw new NotFoundError("Inbound profile");
  if (!profile.ivrFlowId || !profile.ivrFlowVersionId) {
    throw new ConflictError("This inbound profile has no IVR deployment to unapply.", "IVR_PROFILE_NOT_APPLIED");
  }

  await prisma.inboundProfile.update({
    where: { id: profile.id },
    data: { ivrFlowId: null, ivrFlowVersionId: null },
  });

  return profile;
}
