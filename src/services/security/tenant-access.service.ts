import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { AuthenticatedUser } from "@/lib/auth";

import { NotFoundError } from "@/lib/app-error";

type TenantUser = Pick<AuthenticatedUser, "id" | "role" | "tenantId">;

function canBypassOwnership(user: TenantUser): boolean {
  return user.role === UserRole.SUPER_ADMIN;
}

export async function assertCampaignOwnership(
  campaignId: string,
  user: TenantUser
): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      ...(canBypassOwnership(user)
        ? {}
        : {
            ownerUser: {
              tenantId: user.tenantId ?? "",
            },
          }),
    },
    select: { id: true },
  });

  if (!campaign) {
    throw new NotFoundError("Campaign", campaignId);
  }
}

export async function assertCallOwnership(callId: string, user: TenantUser): Promise<void> {
  const call = await prisma.call.findFirst({
    where: {
      id: callId,
      ...(canBypassOwnership(user)
        ? {}
        : {
            campaign: {
              ownerUser: {
                tenantId: user.tenantId ?? "",
              },
            },
          }),
    },
    select: { id: true },
  });

  if (!call) {
    throw new NotFoundError("Call", callId);
  }
}

export async function assertContactOwnership(contactId: string, user: TenantUser): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      ...(canBypassOwnership(user)
        ? {}
        : {
            ownerUser: {
              tenantId: user.tenantId ?? "",
            },
          }),
    },
    select: { id: true },
  });

  if (!contact) {
    throw new NotFoundError("Contact", contactId);
  }
}

export async function assertKnowledgeDocumentOwnership(
  documentId: string,
  user: TenantUser
): Promise<void> {
  const document = await prisma.knowledgeDocument.findFirst({
    where: {
      id: documentId,
      ...(canBypassOwnership(user)
        ? {}
        : {
            ownerUser: {
              tenantId: user.tenantId ?? "",
            },
          }),
    },
    select: { id: true },
  });

  if (!document) {
    throw new NotFoundError("Knowledge document", documentId);
  }
}

export async function assertIvrFlowOwnership(
  flowId: string,
  user: TenantUser
): Promise<void> {
  const flow = await prisma.iVRFlow.findFirst({
    where: {
      id: flowId,
      ...(canBypassOwnership(user)
        ? {}
        : {
            tenantId: user.tenantId ?? "",
          }),
    },
    select: { id: true },
  });

  if (!flow) {
    throw new NotFoundError("IVR flow", flowId);
  }
}
