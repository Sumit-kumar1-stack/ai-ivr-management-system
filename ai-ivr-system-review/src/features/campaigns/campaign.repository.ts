import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

import type { CreateCampaignInput } from "./campaign.schema";

export const CampaignRepository = {
  findAll(ownerUserId?: string) {
    return prisma.campaign.findMany({
      where: ownerUserId
        ? {
            ownerUserId,
          }
        : undefined,

      include: {
        contacts: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    });
  },

  findById(id: string, ownerUserId?: string) {
    return prisma.campaign.findFirst({
      where: {
        id,
        ...(ownerUserId
          ? {
              ownerUserId,
            }
          : {}),
      },

      include: {
        contacts: {
          include: {
            contact: true,
          },
        },
      },
    });
  },

  create(data: CreateCampaignInput & { ownerUserId?: string }) {
    return prisma.campaign.create({
      data,
    });
  },

  update(id: string, data: Prisma.CampaignUpdateInput) {
    return prisma.campaign.update({
      where: { id },
      data,
    });
  },

  delete(id: string) {
    return prisma.campaign.delete({
      where: { id },
    });
  },
};
