import {
  CallStatus,
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma";

async function main():
  Promise<void> {
  const now =
    new Date();

  const activeCampaigns =
    await prisma.campaign.findMany({
      where: {
        status: {
          in: [
            CampaignStatus.QUEUED,
            CampaignStatus.RUNNING,
          ],
        },
      },

      select: {
        id:
          true,

        name:
          true,

        status:
          true,
      },
    });

  console.log(
    "Active campaigns before update:",
    activeCampaigns
  );

  const result =
    await prisma.$transaction(
      async transaction => {
        const calls =
          await transaction.call.updateMany({
            where: {
              status: {
                in: [
                  CallStatus.QUEUED,
                  CallStatus.RINGING,
                  CallStatus.ANSWERED,
                ],
              },
            },

            data: {
              status:
                CallStatus.CANCELED,

              completedAt:
                now,

              endedAt:
                now,

              nextRetryAt:
                null,

              retryReason:
                null,
            },
          });

        const campaignRuns =
          await transaction.campaignRun.updateMany({
            where: {
              status: {
                in: [
                  CampaignRunStatus.QUEUED,
                  CampaignRunStatus.RUNNING,
                ],
              },
            },

            data: {
              status:
                CampaignRunStatus.CANCELLED,

              completedAt:
                now,
            },
          });

        const campaigns =
          await transaction.campaign.updateMany({
            where: {
              status: {
                in: [
                  CampaignStatus.QUEUED,
                  CampaignStatus.RUNNING,
                ],
              },
            },

            data: {
              status:
                CampaignStatus.CANCELLED,

              completedAt:
                now,
            },
          });

        return {
          calls:
            calls.count,

          campaignRuns:
            campaignRuns.count,

          campaigns:
            campaigns.count,
        };
      }
    );

  console.log(
    "Updated records:",
    result
  );

  const remaining =
    await prisma.campaign.findMany({
      where: {
        status: {
          in: [
            CampaignStatus.QUEUED,
            CampaignStatus.RUNNING,
          ],
        },
      },

      select: {
        id:
          true,

        name:
          true,

        status:
          true,
      },
    });

  console.log(
    "Still active after update:",
    remaining
  );
}

main()
  .catch(
    error => {
      console.error(
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );