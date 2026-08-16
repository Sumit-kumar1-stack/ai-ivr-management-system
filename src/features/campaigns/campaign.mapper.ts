import type {
  Campaign,
  CampaignContact,
} from "@prisma/client";

import type {
  CampaignDTO,
} from "./campaign.types";

//--------------------------------------------------
// Campaign With Contacts
//--------------------------------------------------

type CampaignWithContacts =
  Campaign & {
    contacts:
      CampaignContact[];
  };

//--------------------------------------------------
// Mapper
//--------------------------------------------------

export function toCampaignDTO(
  campaign:
    CampaignWithContacts
): CampaignDTO {
  return {
    id:
      campaign.id,

    name:
      campaign.name,

    description:
      campaign.description ??
      undefined,

    language:
      campaign.language,

    voice:
      campaign.voice,

    prompt:
      campaign.prompt ??
      undefined,

    purpose:
      campaign.purpose,

    status:
      campaign.status,

    scheduledAt:
      campaign
        .scheduledAt
        ?.toISOString(),

    createdAt:
      campaign
        .createdAt
        .toISOString(),

    contactCount:
      campaign
        .contacts
        .length,
  };
}