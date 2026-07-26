import {
  CallStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

const ACTIVE_CALL_STATUSES: CallStatus[] = [
  "QUEUED",
  "RINGING",
  "ANSWERED",
];

const FAILED_CALL_STATUSES: CallStatus[] = [
  "FAILED",
  "BUSY",
  "NO_ANSWER",
  "CANCELED",
];

const ACTIVE_CALL_WINDOW_MINUTES =
  30;

function getStartOfToday(): Date {
  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  return today;
}

function getActiveCallCutoff(): Date {
  const cutoff =
    new Date();

  cutoff.setMinutes(
    cutoff.getMinutes() -
      ACTIVE_CALL_WINDOW_MINUTES
  );

  return cutoff;
}

export class DashboardRepository {
  static activeCalls() {
    const cutoff =
      getActiveCallCutoff();

    return prisma.call.count({
      where: {
        status: {
          in:
            ACTIVE_CALL_STATUSES,
        },

        updatedAt: {
          gte:
            cutoff,
        },
      },
    });
  }

  static queuedCalls() {
    const cutoff =
      getActiveCallCutoff();

    return prisma.call.count({
      where: {
        status:
          "QUEUED",

        updatedAt: {
          gte:
            cutoff,
        },
      },
    });
  }

  static thinkingCalls() {
    const cutoff =
      getActiveCallCutoff();

    return prisma.callEvent.groupBy({
      by: [
        "callId",
      ],

      where: {
        type:
          "THINKING",

        createdAt: {
          gte:
            cutoff,
        },

        call: {
          status: {
            in:
              ACTIVE_CALL_STATUSES,
          },

          updatedAt: {
            gte:
              cutoff,
          },
        },
      },
    });
  }

  static speakingCalls() {
    const cutoff =
      getActiveCallCutoff();

    return prisma.callEvent.groupBy({
      by: [
        "callId",
      ],

      where: {
        type:
          "SPEAKING",

        createdAt: {
          gte:
            cutoff,
        },

        call: {
          status: {
            in:
              ACTIVE_CALL_STATUSES,
          },

          updatedAt: {
            gte:
              cutoff,
          },
        },
      },
    });
  }

  static completedToday() {
    const today =
      getStartOfToday();

    return prisma.call.count({
      where: {
        status:
          "COMPLETED",

        OR: [
          {
            completedAt: {
              gte:
                today,
            },
          },
          {
            completedAt:
              null,

            endedAt: {
              gte:
                today,
            },
          },
        ],
      },
    });
  }

  static failedToday() {
    const today =
      getStartOfToday();

    return prisma.call.count({
      where: {
        status: {
          in:
            FAILED_CALL_STATUSES,
        },

        OR: [
          {
            failedAt: {
              gte:
                today,
            },
          },
          {
            failedAt:
              null,

            endedAt: {
              gte:
                today,
            },
          },
          {
            failedAt:
              null,

            endedAt:
              null,

            updatedAt: {
              gte:
                today,
            },
          },
        ],
      },
    });
  }

  static getActiveCalls() {
    const cutoff =
      getActiveCallCutoff();

    return prisma.call.findMany({
      where: {
        status: {
          in:
            ACTIVE_CALL_STATUSES,
        },

        updatedAt: {
          gte:
            cutoff,
        },
      },

      include: {
        contact: {
          select: {
            id:
              true,

            fullName:
              true,

            phone:
              true,

            language:
              true,
          },
        },

        campaign: {
          select: {
            id:
              true,

            name:
              true,
          },
        },

        events: {
          take:
            1,

          orderBy: {
            createdAt:
              "desc",
          },

          select: {
            type:
              true,

            createdAt:
              true,
          },
        },
      },

      orderBy: {
        updatedAt:
          "desc",
      },
    });
  }

  static getTimeline(
    limit = 40
  ) {
    return prisma.callEvent.findMany({
      take:
        limit,

      include: {
        call: {
          select: {
            id:
              true,

            status:
              true,

            contact: {
              select: {
                fullName:
                  true,

                phone:
                  true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt:
          "desc",
      },
    });
  }
}