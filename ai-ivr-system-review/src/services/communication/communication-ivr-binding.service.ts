import {
  CommunicationCampaignStatus,
  CommunicationChannel,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

//--------------------------------------------------
// Published Flow Summary
//--------------------------------------------------

export interface PublishedCommunicationIvrFlow {
  id:
    string;

  name:
    string;

  description:
    string | null;

  version:
    number;
}

//--------------------------------------------------
// List Valid Published Flows
//--------------------------------------------------

export async function listPublishedCommunicationIvrFlows():
  Promise<
    PublishedCommunicationIvrFlow[]
  > {
  const flows =
    await prisma
      .iVRFlow
      .findMany({
        where: {
          isPublished:
            true,
        },

        orderBy: [
          {
            updatedAt:
              "desc",
          },

          {
            version:
              "desc",
          },
        ],
      });

  return flows
    .filter(
      flow =>
        IVRFlowService
          .getRuntimeMenu(
            flow
          ) !==
        null
    )
    .map(
      flow => ({
        id:
          flow.id,

        name:
          flow.name,

        description:
          flow.description,

        version:
          flow.version,
      })
    );
}

//--------------------------------------------------
// Require Valid Published Flow
//--------------------------------------------------

export async function requirePublishedCommunicationIvrFlow(
  ivrFlowId:
    string
) {
  const id =
    ivrFlowId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "IVR flow ID is required"
    );
  }

  const flow =
    await prisma
      .iVRFlow
      .findUnique({
        where: {
          id,
        },
      });

  if (
    !flow
  ) {
    throw new Error(
      "Selected IVR flow was not found"
    );
  }

  if (
    !flow.isPublished
  ) {
    throw new Error(
      "Selected IVR flow is not published"
    );
  }

  const menu =
    IVRFlowService
      .getRuntimeMenu(
        flow
      );

  if (
    !menu
  ) {
    throw new Error(
      "Selected IVR flow does not contain a valid runtime DTMF menu"
    );
  }

  return flow;
}

//--------------------------------------------------
// Bind Flow
//--------------------------------------------------

export async function bindCommunicationIvrFlow(
  communicationCampaignId:
    string,

  ivrFlowId:
    string
): Promise<PublishedCommunicationIvrFlow> {
  const campaignId =
    communicationCampaignId
      .trim();

  if (
    !campaignId
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id:
            campaignId,
        },

        select: {
          id:
            true,

          status:
            true,

          channels:
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
  // Editable
  //------------------------------------------------

  if (
    campaign.status !==
      CommunicationCampaignStatus.DRAFT &&
    campaign.status !==
      CommunicationCampaignStatus.READY
  ) {
    throw new Error(
      `IVR configuration cannot be changed while campaign status is ${campaign.status}`
    );
  }

  //------------------------------------------------
  // IVR Selected
  //------------------------------------------------

  if (
    !campaign.channels
      .includes(
        CommunicationChannel.IVR
      )
  ) {
    throw new Error(
      "IVR is not selected for this communication campaign"
    );
  }

  //------------------------------------------------
  // Published Flow
  //------------------------------------------------

  const flow =
    await requirePublishedCommunicationIvrFlow(
      ivrFlowId
    );

  //------------------------------------------------
  // Bind
  //------------------------------------------------

  await prisma
    .communicationCampaign
    .update({
      where: {
        id:
          campaign.id,
      },

      data: {
        ivrFlowId:
          flow.id,
      },
    });

  return {
    id:
      flow.id,

    name:
      flow.name,

    description:
      flow.description,

    version:
      flow.version,
  };
}