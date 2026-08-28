import type { CampaignContact, Contact } from "@prisma/client";

export function toCampaignContactDTO(item: CampaignContact & { contact: Contact }) {
  return {
    id: item.contact.id,
    fullName: item.contact.fullName,
    phone: item.contact.phone,
    email: item.contact.email,
    company: item.contact.company,
    language: item.contact.language,
    status: item.contact.status,
  };
}
