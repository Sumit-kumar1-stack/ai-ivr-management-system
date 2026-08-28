import {
  randomUUID,
} from "node:crypto";

import {
  CampaignRunStatus,
  CampaignStatus,
  CommunicationChannel,
} from "@prisma/client";

import type {
  CommunicationVoiceRuntime,
} from "@/config/communication-plan";

import {
  prisma,
} from "@/lib/prisma";

import {
  startCampaignExecution,
} from "@/services/campaigns/campaign-start.service";

import {
  ensureCommunicationContacts,
} from "./communication-contact-bridge.service";

import {
  resolveCommunicationVoiceRuntime,
} from "./communication-entitlement.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationVoiceBridgeResult {
  queued:
    boolean;

  voiceCampaignId:
    string | null;

  campaignRunId:
    string | null;

  alreadyActive:
    boolean;
}

//--------------------------------------------------
// Standard Cascaded Voice Bridge
//
// This remains the public STANDARD entry point.
// A Premium campaign cannot use it directly.
//--------------------------------------------------

export async function startCommunicationVoiceCampaign(
  communicationCampaignId:
    string
): Promise<CommunicationVoiceBridgeResult> {
  return startCommunicationVoiceCampaignForRuntime(
    communicationCampaignId,
    "CASCADED"
  );
}

//--------------------------------------------------
// Premium Gemini Live Voice Bridge
//
// This queues the telephony campaign only.
//
// The actual Gemini Live session is created later,
// per phone call, when the Twilio Media Stream opens.
//--------------------------------------------------

export async function startCommunicationPremiumVoiceCampaign(
  communicationCampaignId:
    string
): Promise<CommunicationVoiceBridgeResult> {
  return startCommunicationVoiceCampaignForRuntime(
    communicationCampaignId,
    "GEMINI_LIVE"
  );
}

//--------------------------------------------------
// Shared Telephony Campaign Bridge
//--------------------------------------------------

async function startCommunicationVoiceCampaignForRuntime(
  communicationCampaignId:
    string,

  expectedRuntime:
    CommunicationVoiceRuntime
): Promise<CommunicationVoiceBridgeResult> {
  const normalizedCampaignId =
    communicationCampaignId
      .trim();

  if (
    !normalizedCampaignId
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  //------------------------------------------------
  // Communication Campaign
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id:
            normalizedCampaignId,
        },

        include: {
          recipients:
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

  //------------------------------------------------
  // AI Voice Not Selected
  //------------------------------------------------

  if (
    !campaign.channels
      .includes(
        CommunicationChannel.AI_VOICE
      )
  ) {
    return {
      queued:
        false,

      voiceCampaignId:
        null,

      campaignRunId:
        null,

      alreadyActive:
        false,
    };
  }

  //------------------------------------------------
  // M10 — Persisted Runtime Guard
  //------------------------------------------------

  const actualRuntime =
    resolveCommunicationVoiceRuntime(
      campaign.tier
    );

  if (
    actualRuntime !==
    expectedRuntime
  ) {
    throw new Error(
      `COMMUNICATION_VOICE_RUNTIME_MISMATCH:${actualRuntime}`
    );
  }

  //------------------------------------------------
  // Recipients
  //------------------------------------------------

  if (
    campaign.recipients
      .length ===
    0
  ) {
    throw new Error(
      "Communication campaign has no recipients"
    );
  }

  //------------------------------------------------
  // Contacts
  //------------------------------------------------

  const contactIds =
    await ensureCommunicationContacts(
      campaign.recipients
    );

  //------------------------------------------------
  // Child AI Voice Campaign
  //
  // Telephony dispatch is shared by both runtimes.
  // The media runtime is selected later for each
  // individual Call when Twilio opens its stream.
  //------------------------------------------------

  const systemKey =
    `communication:${campaign.id}:voice`;

  const voiceCampaign =
    await prisma
      .campaign
      .upsert({
        where: {
          systemKey,
        },

        create: {
          name:
            `${campaign.name} - AI Voice`,

          description:
            `AI Voice ${actualRuntime} child campaign for communication campaign ${campaign.id}`,

          ownerUserId:
            campaign.ownerUserId,

          systemKey,

          language:
            "English",

          voice:
            "Female",

          purpose:
            "GENERAL",

          scheduledAt:
            campaign
              .launchImmediately
              ? null
              : campaign
                  .scheduledAt,
        },

        update: {
          name:
            `${campaign.name} - AI Voice`,

          description:
            `AI Voice ${actualRuntime} child campaign for communication campaign ${campaign.id}`,

          ownerUserId:
            campaign.ownerUserId,

          scheduledAt:
            campaign
              .launchImmediately
              ? null
              : campaign
                  .scheduledAt,
        },
      });

  const selectedKnowledgeDocumentIds =
    normalizeJsonStringArray(
      campaign.knowledgeDocumentIds
    );

  const childDescription =
    campaign.description
      ?.trim() ||
    `AI Voice ${actualRuntime} child campaign for communication campaign ${campaign.id}`;

  const childPrompt =
    campaign.prompt
      ?.trim() ||
    null;

  await prisma.$transaction(
    async transaction => {
      await transaction.campaign.update({
        where: {
          id:
            voiceCampaign.id,
        },

        data: {
          description:
            childDescription,

          prompt:
            childPrompt,

          scheduledAt:
            campaign.launchImmediately
              ? null
              : campaign.scheduledAt,
        },
      });

      await transaction.campaignContact.deleteMany({
        where: {
          campaignId:
            voiceCampaign.id,
        },
      });

      await transaction.campaignContact.createMany({
        data:
          contactIds.map(
            contactId => ({
              campaignId:
                voiceCampaign.id,

              contactId,
            })
          ),

        skipDuplicates:
          true,
      });

      await transaction.campaignKnowledgeDocument.deleteMany({
        where: {
          campaignId:
            voiceCampaign.id,
        },
      });

      if (
        selectedKnowledgeDocumentIds.length >
        0
      ) {
        await transaction.campaignKnowledgeDocument.createMany({
          data:
            selectedKnowledgeDocumentIds.map(
              knowledgeDocumentId => ({
                id:
                  randomUUID(),

                campaignId:
                  voiceCampaign.id,

                knowledgeDocumentId,
              })
            ),

          skipDuplicates:
            true,
        });
      }

      await transaction.communicationCampaign.update({
        where: {
          id:
            campaign.id,
        },

        data: {
          voiceCampaignId:
            voiceCampaign.id,
        },
      });
    }
  );

  //------------------------------------------------
  // Retry / Duplicate Worker Guard
  //------------------------------------------------

  if (
    isActiveCampaignStatus(
      voiceCampaign.status
    )
  ) {
    const activeRun =
      await prisma
        .campaignRun
        .findFirst({
          where: {
            campaignId:
              voiceCampaign.id,

            status: {
              in: [
                CampaignRunStatus.QUEUED,
                CampaignRunStatus.RUNNING,
              ],
            },
          },

          orderBy: {
            createdAt:
              "desc",
          },

          select: {
            id:
              true,
          },
        });

    return {
      queued:
        true,

      voiceCampaignId:
        voiceCampaign.id,

      campaignRunId:
        activeRun
          ?.id ??
        null,

      alreadyActive:
        true,
    };
  }

  //------------------------------------------------
  // Existing Production Telephony Queue
  //
  // Both STANDARD and PREMIUM reuse the existing
  // outbound dialing infrastructure.
  //
  // Their media/AI runtimes diverge only after
  // Twilio establishes the Media Stream.
  //------------------------------------------------

  const result =
    await startCampaignExecution(
      voiceCampaign.id
    );

  return {
    queued:
      true,

    voiceCampaignId:
      voiceCampaign.id,

    campaignRunId:
      result
        .campaignRunId,

    alreadyActive:
      false,
  };
}

//--------------------------------------------------
// Active Campaign State
//--------------------------------------------------

function isActiveCampaignStatus(
  status:
    CampaignStatus
): boolean {
  return (
    status ===
      CampaignStatus.SCHEDULED ||
    status ===
      CampaignStatus.QUEUED ||
    status ===
      CampaignStatus.RUNNING
  );
}

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
