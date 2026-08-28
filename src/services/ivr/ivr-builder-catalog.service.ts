import {
  AccountStatus,
  CallAuthenticationLevel,
  CommunicationChannel,
  CommunicationCampaignStatus,
  KnowledgeDocumentStatus,
  UserRole,
} from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCommunicationCampaignAccess } from "@/services/communication/communication-campaign.service";
import type { ValidateIVRFlowInput } from "@/services/ivr/ivr-flow-validator.service";
import {
  getCanonicalIvrNodeKinds,
  getIvrFlowTemplate,
  listIvrFlowTemplates,
  type IVRFlowTemplate,
} from "@/services/ivr/ivr-flow-templates.service";
import { resolveRealtimeInputCapability } from "@/services/ivr/realtime-input-capability.service";

export type IVRBuilderContextKind =
  | "STANDALONE"
  | "CAMPAIGN"
  | "INBOUND_PROFILE";

export interface IVRBuilderTargetContext {
  kind: IVRBuilderContextKind;
  campaignId?: string | null;
  inboundProfileId?: string | null;
  returnTo?: string | null;
}

export interface IVRBuilderResourceCatalog {
  supportedNodeKinds: string[];
  supportedChannels: CommunicationChannel[];
  knowledgeDocuments: Array<{
    id: string;
    name: string;
    status: string;
    indexed: boolean;
  }>;
  actions: Array<{
    id: string;
    actionCode: string;
    name: string;
    campaignId: string | null;
  }>;
  transferDestinations: Array<{
    id: string;
    label: string;
    role: UserRole;
  }>;
  callbackConfigurations: Array<{
    id: string;
    label: string;
  }>;
  approvedMessageTemplates: Array<{
    id: string;
    label: string;
  }>;
  inboundProfiles: Array<{
    id: string;
    label: string;
    active: boolean;
    provider: string | null;
    inboundNumberMasked: string | null;
    voiceRuntime: string;
    realtimeInputCapability: ReturnType<typeof resolveRealtimeInputCapability>;
    ivrFlowId: string | null;
    ivrFlowVersionId: string | null;
  }>;
  campaigns: Array<{
    id: string;
    label: string;
    status: CommunicationCampaignStatus;
    channels: CommunicationChannel[];
  }>;
  businessHoursPolicies: Array<{
    id: string;
    label: string;
  }>;
  authenticationLevels: CallAuthenticationLevel[];
  warnings: string[];
}

export interface IVRBuilderContextResolution {
  currentUser: Pick<
    AuthenticatedUser,
    "id" | "role" | "tenantId" | "campaignCapabilities"
  >;
  tenantId: string | null;
  target: IVRBuilderTargetContext;
  catalog: IVRBuilderResourceCatalog;
  templates: IVRFlowTemplate[];
}

export interface ResolveIVRBuilderContextInput {
  campaignId?: string | null;
  inboundProfileId?: string | null;
  returnTo?: string | null;
}

function normalizeReturnTo(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed.slice(0, 500);
}

function maskInboundNumber(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 4) return "••••";
  return `${normalized.slice(0, Math.min(3, normalized.length - 4))}••••${normalized.slice(-4)}`;
}

async function assertInboundProfileAccess(
  inboundProfileId: string,
  user: Pick<AuthenticatedUser, "id" | "role" | "tenantId">
) {
  const id = inboundProfileId.trim();
  if (!id) {
    throw new Error("Inbound profile ID is required");
  }

  const inboundProfile = await prisma.inboundProfile.findFirst({
    where: {
      id,
      ...(user.role === UserRole.SUPER_ADMIN
        ? {}
        : {
            tenantId: user.tenantId ?? "",
          }),
    },
    select: {
      id: true,
      tenantId: true,
    },
  });

  if (!inboundProfile) {
    throw new Error("Inbound profile not found");
  }

  return inboundProfile.tenantId;
}

export async function buildIVRBuilderCatalogForTenant(
  tenantId: string
): Promise<IVRBuilderResourceCatalog> {
  const warnings: string[] = [];

  if (!tenantId) {
    return {
      supportedNodeKinds: getCanonicalIvrNodeKinds(),
      supportedChannels: [CommunicationChannel.AI_VOICE, CommunicationChannel.IVR],
      knowledgeDocuments: [],
      actions: [],
      transferDestinations: [],
      callbackConfigurations: [],
      approvedMessageTemplates: [],
      inboundProfiles: [],
      campaigns: [],
      businessHoursPolicies: [],
      authenticationLevels: Object.values(CallAuthenticationLevel),
      warnings: [
        "No tenant was resolved for the current user, so the IVR resource catalog is empty.",
      ],
    };
  }

  const knowledgeDocuments = await prisma.knowledgeDocument.findMany({
    where: {
      status: KnowledgeDocumentStatus.ACTIVE,
      ownerUser: {
        tenantId,
      },
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
    orderBy: {
      uploadedAt: "desc",
    },
    take: 100,
  });

  const campaigns = await prisma.communicationCampaign.findMany({
    where: {
      ownerUser: {
        tenantId,
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      channels: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  });

  const inboundProfiles = await prisma.inboundProfile.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      name: true,
      active: true,
      voiceRuntime: true,
      ivrFlowId: true,
      ivrFlowVersionId: true,
      numbers: {
        where: { active: true },
        select: { provider: true, providerNumber: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  });

  const transferDestinations = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          accountStatus: AccountStatus.ACTIVE,
          role: {
            in: [UserRole.ADMIN, UserRole.AGENT],
          },
        },
        select: {
          id: true,
          fullName: true,
          role: true,
        },
        orderBy: [
          {
            role: "asc",
          },
          {
            fullName: "asc",
          },
        ],
      });

  const campaignIds = campaigns.map(campaign => campaign.id);
  const actions = campaignIds.length
    ? await prisma.campaignAction.findMany({
        where: {
          communicationCampaignId: {
            in: campaignIds,
          },
          enabled: true,
        },
        select: {
          id: true,
          actionCode: true,
          name: true,
          communicationCampaignId: true,
        },
        orderBy: [
          {
            actionCode: "asc",
          },
          {
            name: "asc",
          },
        ],
      })
    : [];

  const callbackConfigurations: Array<{
    id: string;
    label: string;
  }> = [];

  const businessHoursPolicies: Array<{
    id: string;
    label: string;
  }> = [];

  const approvedMessageTemplates = [
    {
      id: "CALLBACK_CONFIRMATION",
      label: "Callback Confirmation",
    },
    {
      id: "LEAD_FOLLOW_UP",
      label: "Lead Follow-up",
    },
    {
      id: "HUMAN_TRANSFER_UNAVAILABLE",
      label: "Human Transfer Unavailable",
    },
  ];

  if (callbackConfigurations.length === 0) {
    warnings.push(
      "No dedicated callback configuration records were found. Callback nodes will remain draft placeholders until a destination is configured."
    );
  }

  if (businessHoursPolicies.length === 0) {
    warnings.push(
      "No business-hours policy records were found. Business-hours nodes will remain draft placeholders until a policy is configured."
    );
  }

  return {
    supportedNodeKinds: getCanonicalIvrNodeKinds(),
    supportedChannels: [CommunicationChannel.AI_VOICE, CommunicationChannel.IVR],
    knowledgeDocuments: knowledgeDocuments.map(document => ({
      id: document.id,
      name: document.originalName,
      status: document.status,
      indexed: document._count.chunks > 0,
    })),
    actions: actions.map(action => ({
      id: action.id,
      actionCode: action.actionCode,
      name: action.name,
      campaignId: action.communicationCampaignId,
    })),
    transferDestinations: transferDestinations.map(user => ({
      id: user.id,
      label: `${user.fullName} (${user.role})`,
      role: user.role,
    })),
    callbackConfigurations,
    approvedMessageTemplates,
    inboundProfiles: inboundProfiles.map(profile => {
      const number = profile.numbers[0];
      return {
        id: profile.id,
        label: profile.name,
        active: profile.active,
        provider: number?.provider ?? null,
        inboundNumberMasked: number ? maskInboundNumber(number.providerNumber) : null,
        voiceRuntime: profile.voiceRuntime,
        realtimeInputCapability: resolveRealtimeInputCapability({
          provider: number?.provider ?? null,
          runtime: profile.voiceRuntime,
          inputMode: "VOICE_AND_DTMF",
        }),
        ivrFlowId: profile.ivrFlowId,
        ivrFlowVersionId: profile.ivrFlowVersionId,
      };
    }),
    campaigns: campaigns.map(campaign => ({
      id: campaign.id,
      label: campaign.name,
      status: campaign.status,
      channels: campaign.channels,
    })),
    businessHoursPolicies,
    authenticationLevels: Object.values(CallAuthenticationLevel),
    warnings,
  };
}

export async function resolveIVRBuilderContext(
  user: Pick<AuthenticatedUser, "id" | "role" | "tenantId" | "campaignCapabilities">,
  input: ResolveIVRBuilderContextInput
): Promise<IVRBuilderContextResolution> {
  const campaignId = input.campaignId?.trim() ?? "";
  const inboundProfileId = input.inboundProfileId?.trim() ?? "";
  const returnTo = normalizeReturnTo(input.returnTo);

  if (campaignId && inboundProfileId) {
    throw new Error("Choose either a campaign or an inbound profile context, not both.");
  }

  let catalogTenantId = user.tenantId?.trim() ?? "";

  if (campaignId) {
    await assertCommunicationCampaignAccess(campaignId, user);
    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: {
        ownerUser: {
          select: {
            tenantId: true,
          },
        },
      },
    });
    catalogTenantId = campaign?.ownerUser?.tenantId?.trim() ?? "";
  }

  if (inboundProfileId) {
    catalogTenantId = await assertInboundProfileAccess(inboundProfileId, user);
  }

  const target: IVRBuilderTargetContext = campaignId
    ? {
        kind: "CAMPAIGN",
        campaignId,
        returnTo,
      }
    : inboundProfileId
      ? {
          kind: "INBOUND_PROFILE",
          inboundProfileId,
          returnTo,
        }
      : {
          kind: "STANDALONE",
          returnTo,
        };

  const catalog = await buildIVRBuilderCatalogForTenant(catalogTenantId);
  const templates = listIvrFlowTemplates();

  return {
    currentUser: user,
    tenantId: catalogTenantId || null,
    target,
    catalog,
    templates,
  };
}

export function getIvrTemplateById(templateId: string) {
  return getIvrFlowTemplate(templateId);
}

export function toIVRFlowResourceAuthorization(
  catalog: IVRBuilderResourceCatalog
): Pick<
  ValidateIVRFlowInput,
  | "allowedKnowledgeDocumentIds"
  | "allowedActionCodes"
  | "allowedTransferDestinationIds"
  | "allowedCallbackDestinationIds"
  | "allowedTemplateIds"
  | "allowedBusinessHoursPolicyIds"
  | "allowedAuthenticationLevels"
> {
  return {
    allowedKnowledgeDocumentIds: catalog.knowledgeDocuments.map(document => document.id),
    allowedActionCodes: catalog.actions.map(action => action.actionCode),
    allowedTransferDestinationIds: catalog.transferDestinations.map(destination => destination.id),
    allowedCallbackDestinationIds: catalog.callbackConfigurations.map(configuration => configuration.id),
    allowedTemplateIds: catalog.approvedMessageTemplates.map(template => template.id),
    allowedBusinessHoursPolicyIds: catalog.businessHoursPolicies.map(policy => policy.id),
    allowedAuthenticationLevels: catalog.authenticationLevels,
  };
}
