import { prisma } from "@/lib/prisma";

import {
    Prisma,
    CallEventType,
} from "@prisma/client";

export class CallEventRepository {

    static async create(

        data: Prisma.CallEventCreateInput

    ) {

        return prisma.callEvent.create({

            data,

        });

    }

    static async getByCall(

        callId: string

    ) {

        return prisma.callEvent.findMany({

            where: {

                callId,

            },

            orderBy: {

                createdAt: "asc",

            },

        });

    }

    static async getLatest(
  limit = 100
) {

  return prisma.callEvent.findMany({

    orderBy: {

      createdAt: "desc",

    },

    take: limit,

  });

}

}