import {
  CommunicationCampaignStatus,
  CommunicationChannel,
  IVRFlowVersionStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";
import {
  recordCommunicationCampaignMaterialChange,
  type CommunicationCampaignMaterialChangeActor,
} from "@/services/communication/communication-campaign-material-change.service";

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

  publishedVersionId:
    string;

}

//--------------------------------------------------
// List Valid Published Flows
//--------------------------------------------------

export async function listPublishedCommunicationIvrFlows(
  tenantId: string | null | undefined
):
  Promise<
    PublishedCommunicationIvrFlow[]
  > {
  const resolvedTenantId = tenantId?.trim() ?? "";
  if (!resolvedTenantId) {
    return [];
  }

  const flows =
    await prisma
      .iVRFlow
      .findMany({
        where: {
          isPublished:
            true,
          tenantId: resolvedTenantId,
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

  const versions = await prisma.iVRFlowVersion.findMany({
    where: {
      flowId: { in: flows.map(flow => flow.id) },
      tenantId: resolvedTenantId,
      status: IVRFlowVersionStatus.PUBLISHED,
    },
    orderBy: { versionNumber: "desc" },
  });
  const versionByFlowId = new Map(
    versions.map(version => [version.flowId, version] as const)
  );

  return flows.flatMap(flow => {
    const publishedVersion = versionByFlowId.get(flow.id);
    if (!publishedVersion || IVRFlowService.getRuntimeMenu(flow) === null) {
      return [];
    }

    return [{
      id: flow.id,
      name: flow.name,
      description: flow.description,
      version: publishedVersion.versionNumber,
      publishedVersionId: publishedVersion.id,
    }];
  });
}

//--------------------------------------------------
// Require Valid Published Flow
//--------------------------------------------------

export async function requirePublishedCommunicationIvrFlow(
  ivrFlowId: string,
  ivrFlowVersionId?: string | null,
  tenantId?: string | null
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

  if (tenantId?.trim() && flow.tenantId !== tenantId.trim()) {
    throw new Error("Cross-tenant IVR flow binding is not allowed");
  }

  const publishedVersion = ivrFlowVersionId?.trim()
    ? await prisma.iVRFlowVersion.findFirst({
        where: {
          id: ivrFlowVersionId.trim(),
          flowId: flow.id,
          status: IVRFlowVersionStatus.PUBLISHED,
          ...(tenantId?.trim() ? { tenantId: tenantId.trim() } : {}),
        },
      })
    : await IVRFlowService.findPublishedVersion(flow.id);

  if (!publishedVersion) {
    throw new Error("Selected IVR flow has no immutable published version");
  }

  if (!ivrFlowVersionId?.trim() && !flow.isPublished) {
    throw new Error("Selected IVR flow is not published");
  }

  const menu = IVRFlowService.getRuntimeMenu({
    nodes: publishedVersion.nodes,
  });

  if (!menu) {
    throw new Error("Selected IVR flow does not contain a valid runtime DTMF menu");
  }

  return {
    ...flow,
    publishedVersion,
  };
}

//--------------------------------------------------
// Bind Flow
//--------------------------------------------------

export async function bindCommunicationIvrFlow(
  communicationCampaignId:
    string,

  ivrFlowId:
    string,

  ivrFlowVersionId?:
    string | null,

  actor?:
    CommunicationCampaignMaterialChangeActor
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

          ownerUser: {
            select: { tenantId: true },
          },
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
      ivrFlowId,
      ivrFlowVersionId,
      campaign.ownerUser?.tenantId
    );

  if (
    flow.tenantId &&
    flow.tenantId !== campaign.ownerUser?.tenantId
  ) {
    throw new Error("Cross-tenant IVR flow binding is not allowed");
  }

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
        ivrFlowVersionId:
          flow.publishedVersion.id,
      },
    });

  if (actor) {
    await recordCommunicationCampaignMaterialChange(
      campaign.id,
      actor
    );
  }

  return {
    id:
      flow.id,

    name:
      flow.name,

    description:
      flow.description,

    version:
      flow.publishedVersion.versionNumber,

    publishedVersionId:
      flow.publishedVersion.id,
  };
}
