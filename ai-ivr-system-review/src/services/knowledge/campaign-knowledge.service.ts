import {
  prisma,
} from "@/lib/prisma";

export interface CampaignKnowledgeAccessContext {
  ownerUserId?: string | null;
}

//--------------------------------------------------
// Resolve Scoped Knowledge Documents
//--------------------------------------------------

export async function resolveCampaignKnowledgeDocumentIds(
  campaignId:
    string
): Promise<string[]> {
  const id =
    campaignId.trim();

  if (
    !id
  ) {
    return [];
  }

  const links =
    await prisma.$queryRaw<
      Array<{
        knowledgeDocumentId: string;
      }>
    >`
      SELECT "knowledgeDocumentId"
      FROM "CampaignKnowledgeDocument"
      WHERE "campaignId" = ${id}
      ORDER BY "createdAt" ASC
    `;

  return links.map(
    link =>
      link.knowledgeDocumentId
  );
}

export async function resolveSecureCampaignKnowledgeDocumentIds(
  campaignId:
    string,
  context:
    CampaignKnowledgeAccessContext = {}
): Promise<string[]> {
  const id =
    campaignId.trim();

  const ownerUserId =
    context.ownerUserId?.trim() ??
    "";

  if (
    !id ||
    !ownerUserId
  ) {
    return [];
  }

  const links =
    await prisma.$queryRaw<
      Array<{
        knowledgeDocumentId: string;
      }>
    >`
      SELECT ckd."knowledgeDocumentId"
      FROM "CampaignKnowledgeDocument" ckd
      INNER JOIN "Campaign" c
        ON c.id = ckd."campaignId"
      INNER JOIN "KnowledgeDocument" kd
        ON kd.id = ckd."knowledgeDocumentId"
      WHERE ckd."campaignId" = ${id}
        AND c."ownerUserId" = ${ownerUserId}
        AND kd."ownerUserId" = ${ownerUserId}
      ORDER BY ckd."createdAt" ASC
    `;

  return links.map(
    link =>
      link.knowledgeDocumentId
  );
}

export async function resolveCallKnowledgeDocumentIds(
  callId:
    string
): Promise<string[]> {
  const id =
    callId.trim();

  if (
    !id
  ) {
    return [];
  }

  const call =
    await prisma.call.findUnique({
      where: {
        id,
      },

      select: {
        campaignId:
          true,
      },
    });

  if (
    !call?.campaignId
  ) {
    return [];
  }

  return resolveCampaignKnowledgeDocumentIds(
    call.campaignId
  );
}
