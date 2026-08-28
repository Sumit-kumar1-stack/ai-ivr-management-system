import type { Contact } from "@prisma/client";
import type { ContactDTO } from "./contact.types";

export function toContactDTO(contact: Contact): ContactDTO {
  return {
    id: contact.id,
    fullName: contact.fullName,
    phone: contact.phone,
    email: contact.email ?? undefined,
    company: contact.company ?? undefined,
    language: contact.language,
    status: contact.status,
    notes: contact.notes ?? undefined,
    createdAt: contact.createdAt.toISOString(),
  };
}