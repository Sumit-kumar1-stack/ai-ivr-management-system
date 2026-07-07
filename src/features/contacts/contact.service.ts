import { ContactRepository } from "./contact.repository";
import { CreateContactSchema } from "./contact.schema";
import { ConflictError } from "@/lib/errors";
import { toContactDTO } from "./contact.mapper";

export const ContactService = {
  async getContacts(query: any) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const result = await ContactRepository.findMany({
      page,
      limit,
      search: query.search,
      language: query.language,
      status: query.status,
    });

    return {
      contacts: result.contacts.map(toContactDTO),

      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  },

  async createContact(input: unknown) {
    const data = CreateContactSchema.parse(input);

    const exists = await ContactRepository.findByPhone(
      data.phone
    );

    if (exists) {
      throw new ConflictError(
        "Phone number already exists"
      );
    }

    const created = await ContactRepository.create(data);

    return toContactDTO(created);
  },

  async updateContact(
    id: string,
    input: unknown
  ) {
    const updated = await ContactRepository.update(
      id,
      input as any
    );

    return toContactDTO(updated);
  },

  async deleteContact(id: string) {
    await ContactRepository.delete(id);

    return true;
  },

  async importContacts(rows: any[]) {
    const validContacts: {
      fullName: string;
      phone: string;
      email?: string;
      company?: string;
      language?: string;
      notes?: string;
    }[] = [];

    let duplicate = 0;
    let invalid = 0;

    for (const row of rows) {
      try {
        const contact = CreateContactSchema.parse({
          fullName:
            row.fullName ??
            row.Name ??
            row.name,

          phone:
            row.phone ??
            row.Phone,

          email:
            row.email ??
            row.Email,

          company:
            row.company ??
            row.Company,

          language:
            row.language ??
            row.Language ??
            "English",

          notes:
            row.notes ??
            row.Notes,
        });

        const exists =
          await ContactRepository.findByPhone(
            contact.phone
          );

        if (exists) {
          duplicate++;
          continue;
        }

        validContacts.push(contact);
      } catch {
        invalid++;
      }
    }

    if (validContacts.length > 0) {
      await ContactRepository.bulkCreate(validContacts);
    }

    return {
      total: rows.length,
      imported: validContacts.length,
      duplicate,
      invalid,
    };
  },
};