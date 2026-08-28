import {
  CampaignRunStatus,
  CampaignStatus,
  CommunicationChannel,
  Prisma,
} from "@prisma/client";

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
  requirePublishedCommunicationIvrFlow,
} from "./communication-ivr-binding.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationIvrBridgeResult {
  queued:
    boolean;

  ivrCampaignId:
    string | null;

  campaignRunId:
    string | null;

  runtimeFlowId:
    string | null;

  alreadyActive:
    boolean;
}

//--------------------------------------------------
// Start IVR
//--------------------------------------------------

export async function startCommunicationIvrCampaign(
  communicationCampaignId:
    string
): Promise<CommunicationIvrBridgeResult> {
  //------------------------------------------------
  // Parent
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id:
            communicationCampaignId,
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
  // IVR Not Selected
  //------------------------------------------------

  if (
    !campaign.channels
      .includes(
        CommunicationChannel.IVR
      )
  ) {
    return {
      queued:
        false,

      ivrCampaignId:
        null,

      campaignRunId:
        null,

      runtimeFlowId:
        null,

      alreadyActive:
        false,
    };
  }

  //------------------------------------------------
  // Source Binding
  //------------------------------------------------

  if (
    !campaign.ivrFlowId
  ) {
    throw new Error(
      "IVR_FLOW_CONFIGURATION_REQUIRED: Select a published IVR flow before launching this campaign."
    );
  }

  const sourceFlow =
    await requirePublishedCommunicationIvrFlow(
      campaign.ivrFlowId
    );

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
  // Dedicated IVR Child Campaign
  //------------------------------------------------

  const systemKey =
    `communication:${campaign.id}:ivr`;

  const ivrCampaign =
    await prisma
      .campaign
      .upsert({
        where: {
          systemKey,
        },

        create: {
          name:
            `${campaign.name} - IVR`,

          description:
            sourceFlow
              .description ??
            `Classic IVR child campaign for communication campaign ${campaign.id}`,

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
            `${campaign.name} - IVR`,

          description:
            sourceFlow
              .description ??
            `Classic IVR child campaign for communication campaign ${campaign.id}`,

          scheduledAt:
            campaign
              .launchImmediately
              ? null
              : campaign
                  .scheduledAt,
        },
      });

  //------------------------------------------------
  // Contacts
  //------------------------------------------------

  await prisma
    .campaignContact
    .createMany({
      data:
        contactIds.map(
          contactId => ({
            campaignId:
              ivrCampaign.id,

            contactId,
          })
        ),

      skipDuplicates:
        true,
    });

  //------------------------------------------------
  // Runtime Snapshot
  //------------------------------------------------

  const runtimeFlow =
    await prisma
      .$transaction(
        async transaction => {
          let existingRuntime =
            campaign
              .ivrRuntimeFlowId
              ? await transaction
                  .iVRFlow
                  .findUnique({
                    where: {
                      id:
                        campaign
                          .ivrRuntimeFlowId,
                    },
                  })
              : null;

          //----------------------------------------
          // Only One Published Flow On Child Campaign
          //----------------------------------------

          await transaction
            .iVRFlow
            .updateMany({
              where: {
                campaignId:
                  ivrCampaign.id,

                isPublished:
                  true,

                ...(existingRuntime
                  ? {
                      NOT: {
                        id:
                          existingRuntime.id,
                      },
                    }
                  : {}),
              },

              data: {
                isPublished:
                  false,
              },
            });

          //----------------------------------------
          // Update Existing Runtime Snapshot
          //----------------------------------------

          if (
            existingRuntime
          ) {
            existingRuntime =
              await transaction
                .iVRFlow
                .update({
                  where: {
                    id:
                      existingRuntime.id,
                  },

                  data: {
                    name:
                      `${sourceFlow.name} - Runtime`,

                    description:
                      sourceFlow.description,

                    campaignId:
                      ivrCampaign.id,

                    nodes:
                      sourceFlow.nodes as
                        Prisma.InputJsonValue,

                    edges:
                      sourceFlow.edges as
                        Prisma.InputJsonValue,

                    isPublished:
                      true,

                    version:
                      sourceFlow.version,
                  },
                });

            await transaction
              .communicationCampaign
              .update({
                where: {
                  id:
                    campaign.id,
                },

                data: {
                  ivrCampaignId:
                    ivrCampaign.id,

                  ivrRuntimeFlowId:
                    existingRuntime.id,
                },
              });

            return existingRuntime;
          }

          //----------------------------------------
          // Create Runtime Snapshot
          //----------------------------------------

          const created =
            await transaction
              .iVRFlow
              .create({
                data: {
                  name:
                    `${sourceFlow.name} - Runtime`,

                  description:
                    sourceFlow.description,

                  campaignId:
                    ivrCampaign.id,

                  nodes:
                    sourceFlow.nodes as
                      Prisma.InputJsonValue,

                  edges:
                    sourceFlow.edges as
                      Prisma.InputJsonValue,

                  isPublished:
                    true,

                  version:
                    sourceFlow.version,
                },
              });

          await transaction
            .communicationCampaign
            .update({
              where: {
                id:
                  campaign.id,
              },

              data: {
                ivrCampaignId:
                  ivrCampaign.id,

                ivrRuntimeFlowId:
                  created.id,
              },
            });

          return created;
        }
      );

  //------------------------------------------------
  // Worker Retry Guard
  //------------------------------------------------

  if (
    isActiveCampaignStatus(
      ivrCampaign.status
    )
  ) {
    const activeRun =
      await prisma
        .campaignRun
        .findFirst({
          where: {
            campaignId:
              ivrCampaign.id,

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

      ivrCampaignId:
        ivrCampaign.id,

      campaignRunId:
        activeRun
          ?.id ??
        null,

      runtimeFlowId:
        runtimeFlow.id,

      alreadyActive:
        true,
    };
  }

  //------------------------------------------------
  // Existing Campaign Engine
  //------------------------------------------------

  const result =
    await startCampaignExecution(
      ivrCampaign.id
    );

  return {
    queued:
      true,

    ivrCampaignId:
      ivrCampaign.id,

    campaignRunId:
      result
        .campaignRunId,

    runtimeFlowId:
      runtimeFlow.id,

    alreadyActive:
      false,
  };
}

//--------------------------------------------------
// Active
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