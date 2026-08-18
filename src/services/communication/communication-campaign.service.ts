import {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
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
  getCommunicationPlan,
} from "@/config/communication-plan";

import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

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
// Schedule Input
//--------------------------------------------------

export type UpdateCommunicationScheduleInput =
  z.infer<
    typeof updateScheduleSchema
  >;

//--------------------------------------------------
// Create Draft
//--------------------------------------------------

export async function createCommunicationCampaign(
  rawInput:
    unknown
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
  // Current Entitlement
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
    string
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
      .findUnique({
        where: {
          id,
        },
      });

  return campaign
    ? toDTO(
        campaign
      )
    : null;
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
  //------------------------------------------------

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
  //------------------------------------------------

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
  //
  // WhatsApp → SMS
  //------------------------------------------------

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

  //------------------------------------------------
  // More advanced Premium routing is enabled later
  // when orchestration workers are connected.
  //------------------------------------------------

  return CommunicationFallbackPolicy.NONE;
}

//--------------------------------------------------
// DTO
//--------------------------------------------------

function toDTO(
  campaign:
    CommunicationCampaignRecord
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