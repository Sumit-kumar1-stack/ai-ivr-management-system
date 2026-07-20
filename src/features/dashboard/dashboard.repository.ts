import { prisma } from "@/lib/prisma";

export class DashboardRepository {

  static activeCalls() {
    return prisma.call.count({
      where: {
        status: {
          in: [
            "QUEUED",
            "RINGING",
            "ANSWERED",
          ],
        },
      },
    });
  }

  static queuedCalls() {
    return prisma.call.count({
      where: {
        status: "QUEUED",
      },
    });
  }

  static completedToday() {

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return prisma.call.count({
      where: {
        status: "COMPLETED",
        updatedAt: {
          gte: today,
        },
      },
    });

  }

  static failedToday() {

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return prisma.call.count({
      where: {
        status: "FAILED",
        updatedAt: {
          gte: today,
        },
      },
    });

  }

  static getActiveCalls() {

    return prisma.call.findMany({

      where: {

        status: {

          in: [
            "QUEUED",
            "RINGING",
            "ANSWERED",
          ],

        },

      },

      orderBy: {
        createdAt: "desc",
      },

    });

  }

  static getTimeline(limit = 100) {

    return prisma.callEvent.findMany({

      take: limit,

      orderBy: {
        createdAt: "desc",
      },

    });

  }

}