import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

import { CampaignContactRepository } from "./campaign-contact.repository";
import { AssignContactsSchema } from "./campaign-contact.schema";
import { toCampaignContactDTO } from "./campaign-contact.mapper";

export const CampaignContactService = {
  async assignContacts(
    campaignId: string,
    input: unknown
  ) {
    const { contactIds } = AssignContactsSchema.parse(input);

    const campaign = await prisma.campaign.findUnique({
      where: {
        id: campaignId,
      },
    });

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const contacts = await prisma.contact.findMany({
      where: {
        id: {
          in: contactIds,
        },
      },
    });

    if (contacts.length === 0) {
      throw new NotFoundError("Contacts not found");
    }

    const existing =
      await CampaignContactRepository.getExistingAssignments(
        campaignId,
        contactIds
      );

    const existingIds = new Set(
      existing.map((x) => x.contactId)
    );

    const newIds = contactIds.filter(
      (id) => !existingIds.has(id)
    );

    if (newIds.length > 0) {
      await CampaignContactRepository.assignContacts(
        campaignId,
        newIds
      );
    }

    return {
      assigned: newIds.length,
      duplicates: existing.length,
      total: contactIds.length,
    };
  },

  

  async getCampaignContacts(campaignId: string) {
    const list =
      await CampaignContactRepository.getCampaignContacts(
        campaignId
      );

    return list.map(toCampaignContactDTO);
  },

  async removeContact(
    campaignId: string,
    contactId: string
  ) {
    await CampaignContactRepository.removeContact(
      campaignId,
      contactId
    );

    return {
      success: true,
    };
  },

  async countContacts(campaignId: string) {
    return CampaignContactRepository.countContacts(
      campaignId
    );
  },
};

