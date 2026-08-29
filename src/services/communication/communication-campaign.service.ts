import {
  AuditEventOutcome,
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationTier,
  CommunicationCampaignApprovalStatus,
  UserRole,
} from "@prisma/client";

import type {
  CommunicationCampaign as CommunicationCampaignRecord,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  assertCommunicationDeploymentChannelsAvailable,
} from "@/config/communication-deployment-capabilities";

import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

import {
  assertCommunicationCampaignEntitlements,
} from "@/services/communication/communication-entitlement.service";
import {
  resolveTenantBillingContextForUser,
} from "@/services/billing/tenant-subscription.service";
import {
  canArchiveCampaign,
  canCreateCampaign,
  canApproveCampaign,
  canDeleteCampaign,
  canEditCampaign,
  canRejectCampaign,
  canRequestChangesCampaign,
  buildCampaignPermissions,
} from "@/services/communication/campaign-permissions";
import {
  transitionCommunicationCampaign,
} from "@/services/communication/communication-campaign-transition.service";
import {
  recordCommunicationCampaignMaterialChange,
} from "@/services/communication/communication-campaign-material-change.service";
import {
  isCommunicationCampaignMakerCheckerEnabled,
} from "@/config/communication-governance";
import {
  createServerLogger,
} from "@/lib/logger";
import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";
import type {
  AuthenticatedUser,
} from "@/lib/auth";
import type {
  Prisma,
} from "@prisma/client";

type CommunicationCampaignListRecord =
  Pick<
    CommunicationCampaignRecord,
    | "id"
    | "name"
    | "ownerUserId"
    | "audienceSourceId"
    | "audienceSourceName"
    | "recipientCount"
    | "tier"
    | "channels"
    | "smartChanneling"
    | "fallbackPolicy"
    | "status"
    | "approvalStatus"
    | "approvalRequired"
    | "submittedByUserId"
    | "submittedAt"
    | "approvedByUserId"
    | "approvedAt"
    | "approvalReason"
    | "currentRevision"
    | "approvedRevision"
    | "attemptedContactCount"
    | "launchImmediately"
    | "scheduledAt"
    | "voiceCampaignId"
    | "ivrCampaignId"
    | "ivrFlowId"
    | "ivrRuntimeFlowId"
    | "archivedAt"
    | "archivedByUserId"
    | "createdAt"
    | "updatedAt"
  > &
    Partial<
      Pick<
        CommunicationCampaignRecord,
        | "description"
        | "prompt"
        | "knowledgeDocumentIds"
      >
    >
  & {
    ownerUser?: {
      tenantId: string | null;
    } | null;
  };

const governanceLog =
  createServerLogger(
    "communication-campaign-governance"
  );

const communicationCampaignDTOSelect =
  {
    id: true,
    name: true,
    ownerUserId: true,
    description: true,
    prompt: true,
    knowledgeDocumentIds: true,
    audienceSourceId: true,
    audienceSourceName: true,
    recipientCount: true,
    tier: true,
    channels: true,
    smartChanneling: true,
    fallbackPolicy: true,
    status: true,
    approvalRequired: true,
    approvalStatus: true,
    submittedByUserId: true,
    submittedAt: true,
    approvedByUserId: true,
    approvedAt: true,
    approvalReason: true,
    currentRevision: true,
    approvedRevision: true,
    attemptedContactCount: true,
    launchImmediately: true,
    scheduledAt: true,
    voiceCampaignId: true,
    ivrCampaignId: true,
    ivrFlowId: true,
    ivrRuntimeFlowId: true,
    archivedAt: true,
    archivedByUserId: true,
    createdAt: true,
    updatedAt: true,
    ownerUser: {
      select: {
        tenantId: true,
      },
    },
  } satisfies Prisma.CommunicationCampaignSelect;

export type CommunicationCampaignAccessUser =
  {
    id: string;
    role: AuthenticatedUser["role"];
    tenantId?: string | null;
    campaignCapabilities?:
      AuthenticatedUser["campaignCapabilities"];
  };

function buildCommunicationCampaignScope(
  user:
    CommunicationCampaignAccessUser
): Prisma.CommunicationCampaignWhereInput {
  if (user.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  const tenantId =
    user.tenantId?.trim() ?? "";

  return {
    ownerUser: {
      tenantId,
    },
  };
}

export async function assertCommunicationCampaignAccess(
  campaignId:
    string,

  user:
    CommunicationCampaignAccessUser
): Promise<void> {
  const id =
    campaignId.trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },

        select: {
          id:
            true,
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign not found"
    );
  }
}

//--------------------------------------------------
// Channel Input
//--------------------------------------------------

const channelSchema =
  z.enum([
    "SMS",
    "WHATSAPP",
    "AI_VOICE",
    "IVR",
  ]);

//--------------------------------------------------
// Create Schema
//--------------------------------------------------

const createCommunicationCampaignSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(
          3
        )
        .max(
          120
        ),

    audienceSourceId:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          200
        )
        .optional(),

    audienceSourceName:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          255
        ),

    recipientCount:
      z
        .number()
        .int()
        .min(
          0
        )
        .max(
          5_000_000
        ),

    //------------------------------------------------
    // Drafts created at Step 1 intentionally have no
    // selected channels yet. Step 2 persists channels.
    //------------------------------------------------

    channels:
      z
        .array(
          channelSchema
        )
        .max(
          4
        )
        .default(
          []
        ),
  });

//--------------------------------------------------
// Channel Update Schema
//--------------------------------------------------

const updateChannelsSchema =
  z.object({
    channels:
      z
        .array(
          channelSchema
        )
        .min(
          1
        )
        .max(
          4
        ),
  });

//--------------------------------------------------
// Schedule Schema
//--------------------------------------------------

const updateCommunicationCampaignSchema =
  z.object({
    description:
      z
        .string()
        .trim()
        .max(
          1000
        )
        .optional()
        .nullable(),

    prompt:
      z
        .string()
        .trim()
        .max(
          5000
        )
        .optional()
        .nullable(),

    knowledgeDocumentIds:
      z
        .array(
          z.string().trim().min(
            1
          )
        )
        .max(
          200
        )
        .optional(),

    launchImmediately:
      z.boolean().optional(),

    scheduledAt:
      z
        .string()
        .datetime()
        .nullable()
        .optional(),

    submitForApproval:
      z.boolean().optional(),
  });

//--------------------------------------------------
// Create Input
//--------------------------------------------------

export type CreateCommunicationCampaignInput =
  z.infer<
    typeof createCommunicationCampaignSchema
  >;

//--------------------------------------------------
// Channel Update Input
//--------------------------------------------------

export type UpdateCommunicationChannelsInput =
  z.infer<
    typeof updateChannelsSchema
  >;

//--------------------------------------------------
// Schedule Input
//--------------------------------------------------

export type UpdateCommunicationScheduleInput =
  z.infer<
    typeof updateCommunicationCampaignSchema
  >;

//--------------------------------------------------
// List Campaigns
//--------------------------------------------------

export async function getCommunicationCampaigns(
  user:
    CommunicationCampaignAccessUser
) {
  const campaigns =
    await prisma
      .communicationCampaign
      .findMany({
        where: buildCommunicationCampaignScope(
          user
        ),

        orderBy: {
          createdAt:
            "desc",
        },

        select: {
          id:
            true,

          name:
            true,

          ownerUserId:
            true,

          description:
            true,

          prompt:
            true,

          knowledgeDocumentIds:
            true,

          audienceSourceId:
            true,

          audienceSourceName:
            true,

          recipientCount:
            true,

          tier:
            true,

          channels:
            true,

          smartChanneling:
            true,

          fallbackPolicy:
            true,

          status:
            true,

          approvalStatus:
            true,

          approvalRequired:
            true,

          submittedByUserId:
            true,

          submittedAt:
            true,

          approvedByUserId:
            true,

          approvedAt:
            true,

          approvalReason:
            true,

          currentRevision:
            true,

          approvedRevision:
            true,

          attemptedContactCount:
            true,

          launchImmediately:
            true,

          scheduledAt:
            true,

          voiceCampaignId:
            true,

          ivrCampaignId:
            true,

          ivrFlowId:
            true,

          ivrRuntimeFlowId:
            true,

          archivedAt:
            true,

          archivedByUserId:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          ownerUser: {
            select: {
              tenantId:
                true,
            },
          },
        },
      });

  return campaigns.map(
    campaign =>
      toDTO(
        campaign,
        user
      )
  );
}

//--------------------------------------------------
// Create Draft
//--------------------------------------------------

export async function createCommunicationCampaign(
  rawInput:
    unknown,

  user:
    CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO> {
  if (
    !canCreateCampaign(
      user
    )
  ) {
    throw new Error(
      "You are not authorized to create communication campaigns"
    );
  }

  const input =
    createCommunicationCampaignSchema
      .parse(
        rawInput
      );

  //------------------------------------------------
  // Unique Channels
  //------------------------------------------------

  const channels =
    Array.from(
      new Set(
        input.channels
      )
    ) as CommunicationChannel[];

  //------------------------------------------------
  // Current Entitlement Snapshot
  //------------------------------------------------

  const billingContext =
    await resolveTenantBillingContextForUser(
      user.id
    );

  const plan =
    billingContext.deploymentPlan;

  const tier =
    billingContext.effectiveCampaignTier ===
    CommunicationTier.PREMIUM
      ? CommunicationTier.PREMIUM
      : CommunicationTier.STANDARD;

  //------------------------------------------------
  // Derive Premium Features
  //------------------------------------------------

  const smartChanneling =
    plan.features
      .smartChanneling &&
    channels.length >
      1;

  const fallbackPolicy =
    resolveFallbackPolicy(
      channels,
      plan.features
        .omnichannelFallback
    );

  const makerCheckerEnabled =
    isCommunicationCampaignMakerCheckerEnabled();

  //------------------------------------------------
  // If the draft already contains channels, validate
  // them now. An empty Step-1 draft is validated once
  // Step 2 persists its real channel selection.
  //------------------------------------------------

  if (
    channels.length >
    0
  ) {
    assertCommunicationCampaignEntitlements({
      tier,
      channels,
      smartChanneling,
      fallbackPolicy,
      recipientCount:
        input.recipientCount,
    });
  }

  //------------------------------------------------
  // Persist
  //------------------------------------------------

  const campaign =
    await prisma.$transaction(
      async tx => {
        const created =
          await tx.communicationCampaign.create(
            {
              data: {
                name:
                  input.name,

                description:
                  null,

                prompt:
                  null,

                knowledgeDocumentIds:
                  [],

                audienceSourceId:
                  input
                    .audienceSourceId ??
                  null,

                audienceSourceName:
                  input
                    .audienceSourceName,

                recipientCount:
                  input
                    .recipientCount,

                tier,

                channels,

                smartChanneling,

                fallbackPolicy,

                status:
                  CommunicationCampaignStatus.DRAFT,

                approvalRequired:
                  makerCheckerEnabled,

                approvalStatus:
                  makerCheckerEnabled
                    ? CommunicationCampaignApprovalStatus.DRAFT
                    : CommunicationCampaignApprovalStatus.APPROVED,

                currentRevision:
                  1,

                approvedRevision:
                  makerCheckerEnabled
                    ? null
                    : 1,

                attemptedContactCount:
                  0,

                submittedByUserId:
                  user.id,

                submittedAt:
                  makerCheckerEnabled
                    ? null
                    : new Date(),

                approvedByUserId:
                  makerCheckerEnabled
                    ? null
                    : user.id,

                approvedAt:
                  makerCheckerEnabled
                    ? null
                    : new Date(),

                approvalReason:
                  null,

                launchImmediately:
                  true,

                scheduledAt:
                  null,

                archivedAt:
                  null,

                archivedByUserId:
                  null,

                ownerUserId:
                  user.id,
              },

              include: {
                ownerUser: {
                  select: {
                    tenantId:
                      true,
                  },
                },
              },
            }
          );

        if (user.tenantId) {
          await tx.auditEvent.create(
            {
              data: {
                tenantId:
                  user.tenantId,

                actorUserId:
                  user.id,

                actorRole:
                  user.role,

                actorType:
                  "USER",

                entityType:
                  "CommunicationCampaign",

                entityId:
                  created.id,

                resourceType:
                  "CommunicationCampaign",

                resourceId:
                  created.id,

                action:
                  "CAMPAIGN_CREATED",

                outcome:
                  AuditEventOutcome.SUCCEEDED,

                result:
                  "SUCCEEDED",

                afterState: {
                  id:
                    created.id,

                  ownerUserId:
                    created.ownerUserId,

                  approvalStatus:
                    created.approvalStatus,

                  approvalRequired:
                    created.approvalRequired,

                  currentRevision:
                    created.currentRevision,

                  approvedRevision:
                    created.approvedRevision,

                  status:
                    created.status,
                },
              },
            }
          );
        }

        return created;
      }
    );

  governanceLog.info(
    {
      event:
        "CAMPAIGN_CREATED",

      communicationCampaignId:
        campaign.id,

      submittedByUserId:
        user.id,

      approvalRequired:
        campaign.approvalRequired,

      approvalStatus:
        campaign.approvalStatus,
    },
    "Communication campaign created"
  );

  return toDTO(
    campaign,
    user
  );
}

//--------------------------------------------------
// Get Campaign
//--------------------------------------------------

export async function getCommunicationCampaign(
  campaignId:
    string,

  user:
    CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO | null> {
  const id =
    campaignId
      .trim();

  if (
    !id
  ) {
    return null;
  }

  const campaign =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },

        select:
          communicationCampaignDTOSelect,
      });

  return campaign
    ? toDTO(
        campaign,
        user
      )
    : null;
}

//--------------------------------------------------
// Update Channels
//--------------------------------------------------

export async function updateCommunicationCampaignChannels(
  campaignId:
    string,

  rawInput:
    unknown,

  user:
    CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO> {
  const id =
    campaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const input =
    updateChannelsSchema
      .parse(
        rawInput
      );

  const channels =
    Array.from(
      new Set(
        input.channels
      )
    ) as CommunicationChannel[];

  //------------------------------------------------
  // Deployment Availability
  //------------------------------------------------

  assertCommunicationDeploymentChannelsAvailable(
    channels
  );

  const billingContext =
    await resolveTenantBillingContextForUser(
      user.id
    );

  //------------------------------------------------
  // Stored Draft Snapshot
  //--------------------------------------------------

  const existing =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },

        select: {
          id:
            true,

          status:
            true,

          approvalStatus:
            true,

          tier:
            true,

          channels:
            true,

          smartChanneling:
            true,

          fallbackPolicy:
            true,

          recipientCount:
            true,

          currentRevision:
            true,

          approvedRevision:
            true,

          ownerUser: {
            select: {
              tenantId:
                true,
            },
          },

          attemptedContactCount:
            true,
        },
      });

  if (
    !existing
  ) {
    throw new Error(
      "Communication campaign was not found"
    );
  }

  if (
    !canEditCampaign(
      user,
      {
        status:
          existing.status,

        approvalStatus:
          existing.approvalStatus,

        tenantId:
          existing.ownerUser?.tenantId ??
          null,
      }
    )
  ) {
    throw new Error(
      `Communication campaign cannot be edited while status is ${existing.status}`
    );
  }

  //------------------------------------------------
  // Entitlements From Current Billing Context
  //--------------------------------------------------

  const plan =
    billingContext.deploymentPlan;

  const tier =
    billingContext.effectiveCampaignTier;

  const smartChanneling =
    plan.features
      .smartChanneling &&
    channels.length >
      1;

  const fallbackPolicy =
    resolveFallbackPolicy(
      channels,
      plan.features
        .omnichannelFallback
    );

  assertCommunicationCampaignEntitlements({
    tier,

    channels,

    smartChanneling,

    fallbackPolicy,

    recipientCount:
      existing.recipientCount,
  });

  const channelsChanged =
    !areStringArraysEqualIgnoreOrder(
      existing.channels,
      channels
    );

  const deploymentSnapshotChanged =
    existing.tier !== tier ||
    existing.smartChanneling !==
      smartChanneling ||
    existing.fallbackPolicy !==
      fallbackPolicy;

  const materialChanged =
    channelsChanged ||
    deploymentSnapshotChanged;

  if (!materialChanged) {
    const reloaded =
      await prisma.communicationCampaign.findUniqueOrThrow(
        {
          where: {
            id,
          },
          select:
            communicationCampaignDTOSelect,
        }
      );

    return toDTO(
      reloaded,
      user
    );
  }

  //------------------------------------------------
  // Guarded Update
  //--------------------------------------------------

  const updated =
    await prisma
      .communicationCampaign
      .updateMany({
        where: {
          id,

          status: {
            in: [
              CommunicationCampaignStatus.DRAFT,
              CommunicationCampaignStatus.READY,
            ],
          },

          approvalStatus: {
            not: CommunicationCampaignApprovalStatus.SUBMITTED,
          },
        },

      data: {
        channels,
        smartChanneling,
        fallbackPolicy,
        tier,
      },
    });

  if (
    updated.count ===
    0
  ) {
    throw new Error(
      "Communication campaign changed while channels were being saved"
    );
  }

  const campaign =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },

        select:
          communicationCampaignDTOSelect,
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign disappeared after channel update"
    );
  }

  if (materialChanged) {
    await recordCommunicationCampaignMaterialChange(
      id,
      user
    );
  }

  const reloaded =
    await prisma.communicationCampaign.findUniqueOrThrow(
      {
        where: {
          id,
        },
        select:
          communicationCampaignDTOSelect,
      }
    );

  return toDTO(
    reloaded,
    user
  );
}

//--------------------------------------------------
// Update Scheduling
//--------------------------------------------------

export async function updateCommunicationCampaignSchedule(
  campaignId:
    string,

  rawInput:
    unknown,

  user:
    CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO> {
  const id =
    campaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const input =
    updateCommunicationCampaignSchema
      .parse(
        rawInput
      );

  const submitForApproval =
    input.submitForApproval === true;

  //------------------------------------------------
  // Resolve Updates
  //------------------------------------------------

  const updateData:
    Prisma.CommunicationCampaignUncheckedUpdateManyInput =
      {};

  if (
    input.description !==
    undefined
  ) {
    updateData.description =
      input.description
        ?.trim() ||
      null;
  }

  const nextDescription =
    input.description !==
    undefined
      ? input.description?.trim() || null
      : undefined;

  if (
    input.prompt !==
    undefined
  ) {
    updateData.prompt =
      input.prompt
        ?.trim() ||
      null;
  }

  const nextPrompt =
    input.prompt !== undefined
      ? input.prompt?.trim() || null
      : undefined;

  if (
    input.knowledgeDocumentIds !==
    undefined
  ) {
    updateData.knowledgeDocumentIds =
      normalizeJsonStringArray(
        input.knowledgeDocumentIds
      );
  }

  const nextKnowledgeDocumentIds =
    input.knowledgeDocumentIds !==
    undefined
      ? normalizeJsonStringArray(
          input.knowledgeDocumentIds
        )
      : undefined;

  if (
    input.launchImmediately !==
    undefined
  ) {
    const scheduledAt =
      input.launchImmediately
        ? null
        : input.scheduledAt
          ? new Date(
              input.scheduledAt
            )
          : null;

    if (
      !input.launchImmediately &&
      !input.scheduledAt
    ) {
      throw new Error(
        "Scheduled campaign time is required when launchImmediately is false"
      );
    }

    if (
      scheduledAt &&
      scheduledAt.getTime() <=
        Date.now()
    ) {
      throw new Error(
        "Scheduled campaign time must be in the future"
      );
    }

    updateData.launchImmediately =
      input.launchImmediately;

    updateData.scheduledAt =
      scheduledAt;
  }

  const nextLaunchImmediately =
    input.launchImmediately !== undefined
      ? input.launchImmediately
      : undefined;

  const nextScheduledAt =
    input.launchImmediately !== undefined
      ? input.launchImmediately
        ? null
        : input.scheduledAt
          ? new Date(input.scheduledAt)
          : null
      : undefined;

  //------------------------------------------------
  // Guard Editable State
  //--------------------------------------------------

  const existing =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },

        select: {
          id:
            true,

          status:
            true,

          approvalStatus:
            true,

          approvalRequired:
            true,

          description:
            true,

          prompt:
            true,

          knowledgeDocumentIds:
            true,

          launchImmediately:
            true,

          scheduledAt:
            true,

          submittedByUserId:
            true,

          submittedAt:
            true,

          approvedByUserId:
            true,

          approvedAt:
            true,

          approvedRevision:
            true,

          ownerUser: {
            select: {
              tenantId:
                true,
            },
          },

          currentRevision:
            true,
        },
      });

  if (
    !existing
  ) {
    throw new Error(
      "Communication campaign was not found"
    );
  }

  if (
    existing.approvalStatus ===
    CommunicationCampaignApprovalStatus.SUBMITTED
  ) {
    throw new Error(
      "Communication campaign cannot be edited while approval is pending"
    );
  }

  if (
    !canEditCampaign(
      user,
      {
        status:
          existing.status,

        approvalStatus:
          existing.approvalStatus,

        tenantId:
          existing.ownerUser?.tenantId ??
          null,
      }
    ) &&
    !submitForApproval
  ) {
    throw new Error(
      `Communication campaign cannot be edited while status is ${existing.status}`
    );
  }

  const existingDescription =
    existing.description?.trim() ?? null;

  const existingPrompt =
    existing.prompt?.trim() ?? null;

  const existingKnowledgeDocumentIds =
    normalizeJsonStringArray(
      existing.knowledgeDocumentIds
    );

  const contentChanged =
    (nextDescription !== undefined &&
      nextDescription !== existingDescription) ||
    (nextPrompt !== undefined &&
      nextPrompt !== existingPrompt) ||
    (nextKnowledgeDocumentIds !==
      undefined &&
      !areStringArraysEqualIgnoreOrder(
        existingKnowledgeDocumentIds,
        nextKnowledgeDocumentIds
      ));

  const governanceChanged =
    (nextLaunchImmediately !== undefined &&
      nextLaunchImmediately !==
        existing.launchImmediately) ||
    (nextScheduledAt !== undefined &&
      (existing.scheduledAt?.getTime() ??
        null) !==
        (nextScheduledAt?.getTime() ?? null));

  const materialChanged =
    contentChanged ||
    governanceChanged;

  if (
    !materialChanged &&
    !submitForApproval
  ) {
    const reloaded =
      await prisma.communicationCampaign.findUniqueOrThrow(
        {
          where: {
            id,
          },
          select:
            communicationCampaignDTOSelect,
        }
      );

    return toDTO(
      reloaded,
      user
    );
  }

  if (
    isCommunicationCampaignMakerCheckerEnabled()
  ) {
    updateData.approvalRequired =
      true;
  }

  const updated =
    await prisma
      .communicationCampaign
      .updateMany({
        where: {
          id,

          status: {
            in: [
              CommunicationCampaignStatus.DRAFT,
              CommunicationCampaignStatus.READY,
            ],
          },

          approvalStatus: {
            not:
              CommunicationCampaignApprovalStatus.SUBMITTED,
          },
        },

        data:
          updateData,
      });

  if (
    updated.count ===
    0
  ) {
    const existing =
      await prisma
        .communicationCampaign
        .findUnique({
          where: {
            id,
          },

          select: {
            status:
              true,
          },
        });

    if (
      !existing
    ) {
      throw new Error(
        "Communication campaign was not found"
      );
    }

    throw new Error(
      `Communication campaign cannot be edited while status is ${existing.status}`
    );
  }

  //------------------------------------------------
  // Reload
  //--------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          id,

          ...buildCommunicationCampaignScope(
            user
          ),
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign disappeared after update"
    );
  }

  if (materialChanged) {
    await recordCommunicationCampaignMaterialChange(
      id,
      user
    );
  }

  if (
    submitForApproval
  ) {
    await transitionCommunicationCampaign({
      campaignId: id,
      actor: user,
      requestedTransition:
        "SUBMIT_FOR_APPROVAL",
    });

    const submitted =
      await prisma.communicationCampaign.findUnique(
        {
          where: {
            id,
          },
          select:
            communicationCampaignDTOSelect,
        }
      );

    if (!submitted) {
      throw new Error(
        "Communication campaign disappeared after submission"
      );
    }

    governanceLog.info(
      {
        event:
          "CAMPAIGN_SUBMITTED",

        communicationCampaignId:
          submitted.id,

        submittedByUserId:
          user.id,

        approvalRequired:
          updateData.approvalRequired ===
          true,

        approvalStatus:
          CommunicationCampaignApprovalStatus.SUBMITTED,
      },
      "Communication campaign changes submitted for review"
    );

    return toDTO(
      submitted,
      user
    );
  }

  const reloaded =
    await prisma.communicationCampaign.findUniqueOrThrow(
      {
        where: {
          id,
        },
        select:
          communicationCampaignDTOSelect,
      }
    );

  return toDTO(
    reloaded,
    user
  );
}

//--------------------------------------------------
// Review
//--------------------------------------------------

export interface CommunicationCampaignReviewInput {
  reason?: string | null;
}

export async function approveCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO> {
  return reviewCommunicationCampaign(
    campaignId,
    user,
    "APPROVED"
  );
}

export async function rejectCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser,
  input: CommunicationCampaignReviewInput
): Promise<CommunicationCampaignDTO> {
  return reviewCommunicationCampaign(
    campaignId,
    user,
    "REJECTED",
    input.reason
  );
}

export async function requestChangesCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser,
  input: CommunicationCampaignReviewInput
): Promise<CommunicationCampaignDTO> {
  return reviewCommunicationCampaign(
    campaignId,
    user,
    "REQUEST_CHANGES",
    input.reason
  );
}

async function reviewCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser,
  decision:
    | "APPROVED"
    | "REJECTED"
    | "REQUEST_CHANGES",
  reason?: string | null
): Promise<CommunicationCampaignDTO> {
  const id =
    campaignId.trim();

  if (!id) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await prisma.communicationCampaign.findFirst({
      where: {
        id,
        ...buildCommunicationCampaignScope(
          user
        ),
      },

      select: {
        id: true,
        ownerUserId: true,
        submittedByUserId: true,
        approvalRequired: true,
        approvalStatus: true,
        currentRevision: true,
        approvedRevision: true,
        ownerUser: {
          select: {
            tenantId:
              true,
          },
        },
      },
    });

  if (!campaign) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  if (!campaign.approvalRequired) {
    throw new Error(
      "Maker-checker is not enabled for this communication campaign"
    );
  }

  const campaignTenantId =
    campaign.ownerUser?.tenantId ??
    null;

  if (
    decision === "APPROVED" &&
    !canApproveCampaign(
      user,
      {
        ...campaign,
        tenantId:
          campaignTenantId,
      }
    )
  ) {
    throw new Error(
      "The same user cannot approve their own communication campaign"
    );
  }

  if (
    decision === "APPROVED" &&
    campaign.approvalStatus ===
      CommunicationCampaignApprovalStatus.APPROVED
  ) {
    throw new Error(
      "Communication campaign is already approved"
    );
  }

  if (
    decision === "REJECTED" &&
    !canRejectCampaign(
      user,
      {
        ...campaign,
        tenantId:
          campaignTenantId,
      }
    )
  ) {
    throw new Error(
      "The same user cannot reject their own communication campaign"
    );
  }

  if (
    decision === "REQUEST_CHANGES" &&
    !canRequestChangesCampaign(
      user,
      {
        ...campaign,
        tenantId:
          campaignTenantId,
      }
    )
  ) {
    throw new Error(
      "The same user cannot request changes on their own communication campaign"
    );
  }

  await transitionCommunicationCampaign({
    campaignId: campaign.id,
    actor: user,
    requestedTransition:
      decision === "APPROVED"
        ? "APPROVE"
        : decision === "REQUEST_CHANGES"
          ? "REQUEST_CHANGES"
          : "REJECT",
    reason,
  });

  const updated =
    await prisma.communicationCampaign.findUniqueOrThrow({
      where: {
        id: campaign.id,
      },
      select:
        communicationCampaignDTOSelect,
    });

  governanceLog.info(
    {
      event:
        decision === "APPROVED"
          ? "CAMPAIGN_APPROVED"
          : decision === "REQUEST_CHANGES"
            ? "CAMPAIGN_CHANGES_REQUESTED"
            : "CAMPAIGN_REJECTED",

      communicationCampaignId:
        updated.id,

      reviewedByUserId:
        user.id,

      submittedByUserId:
        updated.submittedByUserId,

      approvalStatus:
        updated.approvalStatus,
    },
    decision === "APPROVED"
      ? "Communication campaign approved"
      : decision === "REQUEST_CHANGES"
        ? "Communication campaign changes requested"
        : "Communication campaign rejected"
  );

  return toDTO(updated, user);
}

//--------------------------------------------------
// Archive
//--------------------------------------------------

export async function archiveCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser
): Promise<CommunicationCampaignDTO> {
  const id = campaignId.trim();

  if (!id) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await prisma.communicationCampaign.findFirst({
      where: {
        id,
        ...buildCommunicationCampaignScope(user),
      },

      select: {
        id: true,
        status: true,
        attemptedContactCount: true,
        ownerUserId: true,
        submittedByUserId: true,
        ownerUser: {
          select: {
            tenantId:
              true,
          },
        },
      },
    });

  if (!campaign) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  if (
    !canArchiveCampaign(
      user,
      {
        status:
          campaign.status,

        tenantId:
          campaign.ownerUser?.tenantId ??
          null,
      }
    )
  ) {
    throw new Error(
      `Communication campaign cannot be archived while status is ${campaign.status}`
    );
  }

  await transitionCommunicationCampaign({
    campaignId: campaign.id,
    actor: user,
    requestedTransition:
      "ARCHIVE",
  });

  const updated =
    await prisma.communicationCampaign.findUniqueOrThrow({
      where: {
        id: campaign.id,
      },
      select:
        communicationCampaignDTOSelect,
    });

  governanceLog.info(
    {
      event:
        "CAMPAIGN_ARCHIVED",

      communicationCampaignId:
        updated.id,

      archivedByUserId:
        user.id,
    },
    "Communication campaign archived"
  );

  return toDTO(updated, user);
}

//--------------------------------------------------
// Delete
//--------------------------------------------------

export async function deleteCommunicationCampaign(
  campaignId: string,
  user: CommunicationCampaignAccessUser
): Promise<{
  communicationCampaignId: string;
}> {
  const id = campaignId.trim();

  if (!id) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await prisma.communicationCampaign.findFirst({
      where: {
        id,
        ...buildCommunicationCampaignScope(user),
      },

      select: {
        id: true,
        status: true,
        approvalStatus: true,
        attemptedContactCount: true,
        ownerUserId: true,
        submittedByUserId: true,
        ownerUser: {
          select: {
            tenantId:
              true,
          },
        },
      },
    });

  if (!campaign) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  if (
    !canDeleteCampaign(
      user,
      {
        status:
          campaign.status,

        approvalStatus:
          campaign.approvalStatus,

        attemptedContactCount:
          campaign.attemptedContactCount,

        ownerUserId: campaign.ownerUserId,

        submittedByUserId: campaign.submittedByUserId,

        tenantId:
          campaign.ownerUser?.tenantId ??
          null,
      }
    )
  ) {
    throw new Error(
      `Communication campaign cannot be deleted while status is ${campaign.status}`
    );
  }

  await recordAuditEvent({
    tenantId: campaign.ownerUser?.tenantId ?? user.tenantId ?? "",
    actor: {
      id: user.id,
      role: user.role,
      tenantId: user.tenantId ?? null,
    },
    entityType: "CommunicationCampaign",
    entityId: campaign.id,
    action: "campaign.deleted",
    outcome: AuditEventOutcome.SUCCEEDED,
    beforeState: {
      status: campaign.status,
      approvalStatus: campaign.approvalStatus,
      attemptedContactCount: campaign.attemptedContactCount,
    },
  });

  await prisma.communicationCampaign.delete({
    where: {
      id: campaign.id,
    },
  });

  governanceLog.info(
    {
      event:
        "CAMPAIGN_DELETED",

      communicationCampaignId:
        campaign.id,

      deletedByUserId:
        user.id,
    },
    "Communication campaign deleted"
  );

  return {
    communicationCampaignId:
      campaign.id,
  };
}

//--------------------------------------------------
// Fallback Policy
//--------------------------------------------------

function resolveFallbackPolicy(
  channels:
    CommunicationChannel[],

  fallbackEnabled:
    boolean
): CommunicationFallbackPolicy {
  if (
    !fallbackEnabled
  ) {
    return CommunicationFallbackPolicy.NONE;
  }

  //------------------------------------------------
  // Exact first production fallback:
  // WhatsApp -> SMS
  //--------------------------------------------------

  if (
    channels.includes(
      CommunicationChannel.WHATSAPP
    ) &&
    channels.includes(
      CommunicationChannel.SMS
    )
  ) {
    return CommunicationFallbackPolicy.WHATSAPP_TO_SMS;
  }

  return CommunicationFallbackPolicy.NONE;
}

//--------------------------------------------------
// DTO
//--------------------------------------------------

function toDTO(
  campaign:
    CommunicationCampaignListRecord,
  user:
    CommunicationCampaignAccessUser
): CommunicationCampaignDTO {
  const permissions =
    buildCampaignPermissions(
      user,
      {
        status:
          campaign.status,

        approvalStatus:
          campaign.approvalStatus,

        approvalRequired:
          campaign.approvalRequired,

        tenantId:
          campaign.ownerUser?.tenantId ?? null,

        ownerUserId:
          campaign.ownerUserId ?? null,

        submittedByUserId:
          campaign.submittedByUserId ?? null,

        approvedByUserId:
          campaign.approvedByUserId ?? null,

        currentRevision:
          campaign.currentRevision,

        approvedRevision:
          campaign.approvedRevision,

        attemptedContactCount:
          campaign.attemptedContactCount,
      }
    );

  return {
    id:
      campaign.id,

    name:
      campaign.name,

    description:
      campaign.description ??
      null,

    prompt:
      campaign.prompt ??
      null,

    knowledgeDocumentIds:
      normalizeJsonStringArray(
        campaign.knowledgeDocumentIds
      ),

    audienceSourceId:
      campaign
        .audienceSourceId,

    audienceSourceName:
      campaign
        .audienceSourceName,

    recipientCount:
      campaign
        .recipientCount,

    tier:
      campaign
        .tier,

    channels:
      [
        ...campaign
          .channels,
      ],

    smartChanneling:
      campaign
        .smartChanneling,

    fallbackPolicy:
      campaign
        .fallbackPolicy,

    status:
      campaign.status,

    approvalRequired:
      campaign.approvalRequired,

    approvalStatus:
      campaign.approvalStatus,

    submittedByUserId:
      campaign.submittedByUserId,

    submittedAt:
      campaign.submittedAt
        ? campaign.submittedAt.toISOString()
        : null,

    approvedByUserId:
      campaign.approvedByUserId,

    approvedAt:
      campaign.approvedAt
        ? campaign.approvedAt.toISOString()
        : null,

    approvalReason:
      campaign.approvalReason,

    permissions,

    currentRevision:
      campaign.currentRevision,

    approvedRevision:
      campaign.approvedRevision,

    attemptedContactCount:
      campaign.attemptedContactCount,

    launchImmediately:
      campaign
        .launchImmediately,

    scheduledAt:
      campaign
        .scheduledAt
        ?.toISOString() ??
      null,

    voiceCampaignId:
      campaign
        .voiceCampaignId,

    ivrCampaignId:
      campaign
        .ivrCampaignId,

    ivrFlowId:
      campaign
        .ivrFlowId,

    ivrRuntimeFlowId:
      campaign
        .ivrRuntimeFlowId,

    createdAt:
      campaign
        .createdAt
        .toISOString(),

    updatedAt:
      campaign
        .updatedAt
        .toISOString(),

    archivedAt:
      campaign.archivedAt
        ? campaign.archivedAt.toISOString()
        : null,

    archivedByUserId:
      campaign.archivedByUserId,
  };
}

//--------------------------------------------------
// Knowledge IDs
//--------------------------------------------------

function normalizeJsonStringArray(
  value:
    unknown
): string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .filter(
      (
        item
      ): item is string =>
        typeof item ===
          "string"
    )
    .map(
      item =>
        item.trim()
    )
    .filter(
      Boolean
    );
}

function areStringArraysEqualIgnoreOrder(
  left:
    readonly string[],
  right:
    readonly string[]
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  const normalize =
    (
      values:
        readonly string[]
    ) =>
      [...values]
        .map(
          value =>
            value.trim()
        )
        .sort();

  const leftNormalized =
    normalize(
      left
    );

  const rightNormalized =
    normalize(
      right
    );

  return leftNormalized.every(
    (
      value,
      index
    ) =>
      value ===
      rightNormalized[index]
  );
}
