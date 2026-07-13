import { prisma } from "@/lib/prisma";

import { startCall } from "@/services/telephony/telephony.service";

export async function runCampaign(
  campaignId: string
) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      contacts: {
        include: {
          contact: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const results = [];

  for (const item of campaign.contacts) {
    const result = await startCall({
      campaignId: campaign.id,
      contactId: item.contact.id,
      to: item.contact.phone,
      from: process.env.DEFAULT_CALLER_ID ?? "+911111111111",
      language: item.contact.language,
      script:
        campaign.prompt ??
        "Hello from AI IVR.",
    });

    results.push(result);
  }

  return {
    total: results.length,
    results,
  };
}