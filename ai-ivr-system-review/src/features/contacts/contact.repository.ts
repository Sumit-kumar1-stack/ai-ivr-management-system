import {
  ContactStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import type {
  CreateContactInput,
  UpdateContactInput,
} from "./contact.schema";

export interface ContactQuery {
  page?: number;
  limit?: number;
  search?: string;
  language?: string;
  status?: ContactStatus;
}

export const ContactRepository = {
  async findMany(
    query: ContactQuery,
    ownerUserId?: string
  ) {
    const page =
      query.page ?? 1;

    const limit =
      query.limit ?? 10;

    const skip =
      (page - 1) *
      limit;

    const where:
      Prisma.ContactWhereInput =
        {};

    if (
      ownerUserId
    ) {
      where.ownerUserId =
        ownerUserId;
    }

    if (
      query.search
    ) {
      where.OR = [
        {
          fullName: {
            contains:
              query.search,

            mode:
              "insensitive",
          },
        },

        {
          phone: {
            contains:
              query.search,
          },
        },

        {
          email: {
            contains:
              query.search,

            mode:
              "insensitive",
          },
        },
      ];
    }

    if (
      query.language
    ) {
      where.language =
        query.language;
    }

    if (
      query.status
    ) {
      where.status =
        query.status;
    }

    const [
      contacts,
      total,
    ] =
      await Promise.all([
        prisma.contact.findMany({
          where,

          skip,

          take:
            limit,

          orderBy: {
            createdAt:
              "desc",
          },
        }),

        prisma.contact.count({
          where,
        }),
      ]);

    return {
      contacts,
      total,
    };
  },

  findById(
    id: string,
    ownerUserId?: string
  ) {
    return prisma.contact.findFirst({
      where: {
        id,
        ...(ownerUserId
          ? {
              ownerUserId,
            }
          : {}),
      },
    });
  },

  findByPhone(
    phone: string,
    ownerUserId?: string
  ) {
    return prisma.contact.findFirst({
      where: {
        phone,
        ...(ownerUserId
          ? {
              ownerUserId,
            }
          : {}),
      },
    });
  },

  create(
    data:
      CreateContactInput,
    ownerUserId?: string
  ) {
    return prisma.contact.create({
      data: {
        ...data,
        ownerUserId,
      },
    });
  },

  update(
    id: string,
    data:
      UpdateContactInput
  ) {
    return prisma.contact.update({
      where: {
        id,
      },

      data,
    });
  },

  delete(
    id: string
  ) {
    return prisma.contact.delete({
      where: {
        id,
      },
    });
  },

  bulkCreate(
    data:
      CreateContactInput[],
    ownerUserId?: string
  ) {
    return prisma.contact.createMany({
      data: data.map((contact) => ({
        ...contact,
        ownerUserId,
      })),

      skipDuplicates:
        true,
    });
  },

  async getStatistics(ownerUserId?: string) {
    const scope =
      ownerUserId
        ? {
            ownerUserId,
          }
        : undefined;

    const [
      total,
      pending,
      called,
      answered,
      failed,
      blocked,
    ] =
      await Promise.all([
        prisma.contact.count({
          where: scope,
        }),

        prisma.contact.count({
          where: {
            ...(scope ?? {}),
            status:
              ContactStatus.PENDING,
          },
        }),

        prisma.contact.count({
          where: {
            ...(scope ?? {}),
            status:
              ContactStatus.CALLED,
          },
        }),

        prisma.contact.count({
          where: {
            ...(scope ?? {}),
            status:
              ContactStatus.ANSWERED,
          },
        }),

        prisma.contact.count({
          where: {
            ...(scope ?? {}),
            status:
              ContactStatus.FAILED,
          },
        }),

        prisma.contact.count({
          where: {
            ...(scope ?? {}),
            status:
              ContactStatus.BLOCKED,
          },
        }),
      ]);

    return {
      total,
      pending,
      called,
      answered,
      failed,
      blocked,
    };
  },
};
