export function toCampaignContactDTO(item: any) {
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