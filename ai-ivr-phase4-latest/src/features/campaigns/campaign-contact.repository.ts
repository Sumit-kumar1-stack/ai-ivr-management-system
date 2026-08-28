import { prisma } from "@/lib/prisma";

export const CampaignContactRepository = {
  async assignContacts(campaignId: string, contactIds: string[]) {
    return prisma.campaignContact.createMany({
      data: contactIds.map((contactId) => ({
        campaignId,
        contactId,
      })),
      skipDuplicates: true,
    });
  },

  async getCampaignContacts(
    campaignId: string,
    ownerUserId?: string
  ) {
    return prisma.campaignContact.findMany({
      where: {
        campaignId,
        ...(ownerUserId
          ? {
              contact: {
                is: {
                  ownerUserId,
                },
              },
            }
          : {}),
      },
      include: {
        contact: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  async removeContact(campaignId: string, contactId: string) {
    return prisma.campaignContact.delete({
      where: {
        campaignId_contactId: {
          campaignId,
          contactId,
        },
      },
    });
  },

  async countContacts(campaignId: string) {
    return prisma.campaignContact.count({
      where: {
        campaignId,
      },
    });
  },

  async getExistingAssignments(
    campaignId: string,
    contactIds: string[]
  ) {
    return prisma.campaignContact.findMany({
      where: {
        campaignId,
        contactId: {
          in: contactIds,
        },
      },
    });
  },
};
