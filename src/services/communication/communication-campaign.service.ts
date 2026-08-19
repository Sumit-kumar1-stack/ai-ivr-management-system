import {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  UserRole,
  CommunicationTier,
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

import {
  getCommunicationPlan,
  getCommunicationPlanForTier,
} from "@/config/communication-plan";

import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

import {
  assertCommunicationCampaignEntitlements,
} from "@/services/communication/communication-entitlement.service";
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
    | "audienceSourceId"
    | "audienceSourceName"
    | "recipientCount"
    | "tier"
    | "channels"
    | "smartChanneling"
    | "fallbackPolicy"
    | "status"
    | "launchImmediately"
    | "scheduledAt"
    | "voiceCampaignId"
    | "ivrCampaignId"
    | "ivrFlowId"
    | "ivrRuntimeFlowId"
    | "createdAt"
    | "updatedAt"
  >;

export type CommunicationCampaignAccessUser =
  Pick<
    AuthenticatedUser,
    "id" | "role"
  >;

function buildCommunicationCampaignScope(
  user:
    CommunicationCampaignAccessUser
): Prisma.CommunicationCampaignWhereInput {
  const scope:
    Prisma.CommunicationCampaignWhereInput =
      {};

  if (
    user.role !==
    UserRole.SUPER_ADMIN
  ) {
    scope.ownerUserId =
      user.id;
  }

  return scope;
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

const updateScheduleSchema =
  z.discriminatedUnion(
    "launchImmediately",
    [
      z.object({
        launchImmediately:
          z.literal(
            true
          ),

        scheduledAt:
          z
            .null()
            .optional(),
      }),

      z.object({
        launchImmediately:
          z.literal(
            false
          ),

        scheduledAt:
          z
            .string()
            .datetime(),
      }),
    ]
  );

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
    typeof updateScheduleSchema
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

          createdAt:
            true,

          updatedAt:
            true,
        },
      });

  return campaigns.map(
    campaign =>
      toDTO(
        campaign
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

  const plan =
    getCommunicationPlan();

  const tier =
    plan.tier ===
    "PREMIUM"
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
    await prisma
      .communicationCampaign
      .create({
        data: {
          name:
            input.name,

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

          launchImmediately:
            true,

          scheduledAt:
            null,

          ownerUserId:
            user.id,
        },
      });

  return toDTO(
    campaign
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
      });

  return campaign
    ? toDTO(
        campaign
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
    unknown
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

  //------------------------------------------------
  // Stored Draft Snapshot
  //--------------------------------------------------

  const existing =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id,
        },

        select: {
          id:
            true,

          status:
            true,

          tier:
            true,

          recipientCount:
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
    existing.status !==
      CommunicationCampaignStatus.DRAFT &&
    existing.status !==
      CommunicationCampaignStatus.READY
  ) {
    throw new Error(
      `Communication campaign cannot be edited while status is ${existing.status}`
    );
  }

  //------------------------------------------------
  // Entitlements From Stored Tier
  //--------------------------------------------------

  const plan =
    getCommunicationPlanForTier(
      existing.tier
    );

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
    tier:
      existing.tier,

    channels,

    smartChanneling,

    fallbackPolicy,

    recipientCount:
      existing.recipientCount,
  });

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
        },

        data: {
          channels,
          smartChanneling,
          fallbackPolicy,
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
      .findUnique({
        where: {
          id,
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign disappeared after channel update"
    );
  }

  return toDTO(
    campaign
  );
}

//--------------------------------------------------
// Update Scheduling
//--------------------------------------------------

export async function updateCommunicationCampaignSchedule(
  campaignId:
    string,

  rawInput:
    unknown
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
    updateScheduleSchema
      .parse(
        rawInput
      );

  //------------------------------------------------
  // Resolve Date
  //------------------------------------------------

  const scheduledAt =
    input.launchImmediately
      ? null
      : new Date(
          input.scheduledAt
        );

  if (
    scheduledAt &&
    scheduledAt.getTime() <=
      Date.now()
  ) {
    throw new Error(
      "Scheduled campaign time must be in the future"
    );
  }

  //------------------------------------------------
  // Guard Editable State
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
        },

        data: {
          launchImmediately:
            input
              .launchImmediately,

          scheduledAt,
        },
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
      .findUnique({
        where: {
          id,
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign disappeared after update"
    );
  }

  return toDTO(
    campaign
  );
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
    CommunicationCampaignListRecord
): CommunicationCampaignDTO {
  return {
    id:
      campaign.id,

    name:
      campaign.name,

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
  };
}
