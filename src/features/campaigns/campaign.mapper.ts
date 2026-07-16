import type { Campaign, CampaignContact } from "@prisma/client";
import type { CampaignDTO } from "./campaign.types";

type CampaignWithContacts = Campaign & { contacts: CampaignContact[] };

export function toCampaignDTO(campaign: CampaignWithContacts): CampaignDTO {

return{

id:

campaign.id,

name:

campaign.name,

description:

campaign.description ?? undefined,

language:

campaign.language,

voice:

campaign.voice,

status:

campaign.status,

createdAt:

campaign.createdAt.toISOString(),

contactCount:

campaign.contacts.length,

};

}
