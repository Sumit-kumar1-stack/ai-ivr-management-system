import {
  ContactRepository,
} from "./contact.repository";

import {
  ContactQuerySchema,
  CreateContactSchema,
  UpdateContactSchema,
  type ContactQueryInput,
} from "./contact.schema";

import {
  ConflictError,
} from "@/lib/errors";

import {
  toContactDTO,
} from "./contact.mapper";

export const ContactService = {
  async getContacts(
    query:
      ContactQueryInput
  ) {
    const {
      page,
      limit,
      search,
      language,
      status,
    } =
      ContactQuerySchema.parse(
        query
      );

    const result =
      await ContactRepository.findMany({
        page,
        limit,
        search,
        language,
        status,
      });

    return {
      contacts:
        result.contacts.map(
          toContactDTO
        ),

      meta: {
        page,
        limit,

        total:
          result.total,

        totalPages:
          Math.ceil(
            result.total /
              limit
          ),
      },
    };
  },

  async getContactStatistics() {
    const statistics =
      await ContactRepository.getStatistics();

    return {
      total:
        statistics.total,

      pending:
        statistics.pending,

      called:
        statistics.called +
        statistics.answered,

      failed:
        statistics.failed,

      answered:
        statistics.answered,

      blocked:
        statistics.blocked,
    };
  },

  async createContact(
    input: unknown
  ) {
    const data =
      CreateContactSchema.parse(
        input
      );

    const exists =
      await ContactRepository.findByPhone(
        data.phone
      );

    if (
      exists
    ) {
      throw new ConflictError(
        "Phone number already exists"
      );
    }

    const created =
      await ContactRepository.create(
        data
      );

    return toContactDTO(
      created
    );
  },

  async updateContact(
    id: string,
    input: unknown
  ) {
    const updated =
      await ContactRepository.update(
        id,
        UpdateContactSchema.parse(
          input
        )
      );

    return toContactDTO(
      updated
    );
  },

  async deleteContact(
    id: string
  ) {
    await ContactRepository.delete(
      id
    );

    return true;
  },

  async importContacts(
    rows:
      Record<
        string,
        unknown
      >[]
  ) {
    const validContacts:
      import(
        "./contact.schema"
      ).CreateContactInput[] =
        [];

    let duplicate =
      0;

    let invalid =
      0;

    for (
      const row of
      rows
    ) {
      try {
        const contact =
          CreateContactSchema.parse({
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

        if (
          exists
        ) {
          duplicate++;

          continue;
        }

        validContacts.push(
          contact
        );
      } catch {
        invalid++;
      }
    }

    if (
      validContacts.length >
      0
    ) {
      await ContactRepository.bulkCreate(
        validContacts
      );
    }

    return {
      total:
        rows.length,

      imported:
        validContacts.length,

      duplicate,

      invalid,
    };
  },
};