import {
  CommunicationCampaignStatus,
  CommunicationTier,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Hoisted Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => {
      const logger = {
        debug:
          vi.fn(),

        info:
          vi.fn(),

        warn:
          vi.fn(),

        error:
          vi.fn(),
      };

      const transaction = {
        $queryRaw:
          vi.fn(),

        communicationCampaign: {
          findUnique:
            vi.fn(),

          count:
            vi.fn(),

          updateMany:
            vi.fn(),
        },

        communicationCampaignUsage: {
          findUnique:
            vi.fn(),

          aggregate:
            vi.fn(),

          create:
            vi.fn(),

          update:
            vi.fn(),
        },
      };

      const prisma = {
        $transaction:
          vi.fn(),

        communicationCampaignUsage: {
          updateMany:
            vi.fn(),
        },
      };

      return {
        logger,
        transaction,
        prisma,
      };
    }
  );

//--------------------------------------------------
// Prisma
//--------------------------------------------------

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma:
      mocks.prisma,
  })
);

//--------------------------------------------------
// Logger
//--------------------------------------------------

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    normalizeError:
      vi.fn(
        (
          error:
            unknown
        ) => ({
          message:
            error instanceof
              Error
              ? error.message
              : String(
                  error
                ),
        })
      ),
  })
);

//--------------------------------------------------
// Subject
//--------------------------------------------------

import {
  COMMUNICATION_CONCURRENCY_LIMIT_REACHED,
  COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED,
  normalizeCommunicationUsageDate,
  releaseCommunicationCampaignUsageReservation,
  reserveCommunicationCampaignLaunch,
} from "@/services/communication/communication-usage-limit.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const CAMPAIGN_ID =
  "communication-campaign-1";

const TENANT_ID =
  "tenant-1";

const USAGE_DATE =
  new Date(
    "2026-08-18T12:30:00.000Z"
  );

//--------------------------------------------------
// Helpers
//--------------------------------------------------

function configureCampaign(
  _tier:
    CommunicationTier
): void {
  mocks
    .transaction
    .communicationCampaign
    .findUnique
    .mockResolvedValue({
      id:
        CAMPAIGN_ID,

      tier:
        _tier,

      status:
        CommunicationCampaignStatus.READY,

      ownerUser: {
        tenantId:
          TENANT_ID,
      },
    });
}

function configureNoExistingReservation(): void {
  mocks
    .transaction
    .communicationCampaignUsage
    .findUnique
    .mockResolvedValue(
      null
    );
}

function configureDailyUsed(
  recipientCount:
    number
): void {
  mocks
    .transaction
    .communicationCampaignUsage
    .aggregate
    .mockResolvedValue({
      _sum: {
        recipientCount,
      },
    });
}

async function reserve(
  input: {
    tier:
      CommunicationTier;

    tenantId?:
      string;

    recipientCount:
      number;

    targetStatus?:
      CommunicationCampaignStatus;

    usageDate?:
      Date;
  }
) {
  return reserveCommunicationCampaignLaunch({
    campaignId:
      CAMPAIGN_ID,

    tenantId:
      input.tenantId ??
      TENANT_ID,

    tier:
      input.tier,

    recipientCount:
      input.recipientCount,

    usageDate:
      input.usageDate ??
      USAGE_DATE,

    targetStatus:
      input.targetStatus ??
      CommunicationCampaignStatus.QUEUED,
  });
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "Communication usage limits",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks
          .prisma
          .$transaction
          .mockImplementation(
            async (
              callback:
                (
                  transaction:
                    typeof mocks.transaction
                ) => Promise<unknown>
            ) => callback(
              mocks.transaction
            )
          );

        mocks
          .transaction
          .$queryRaw
          .mockResolvedValue(
            []
          );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            0
          );

        configureNoExistingReservation();
        configureDailyUsed(
          0
        );

        mocks
          .transaction
          .communicationCampaignUsage
          .create
          .mockResolvedValue({
            id:
              "usage-1",
          });

        mocks
          .transaction
          .communicationCampaignUsage
          .update
          .mockResolvedValue({
            id:
              "usage-1",
          });

        mocks
          .transaction
          .communicationCampaign
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });

        mocks
          .prisma
          .communicationCampaignUsage
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });
      }
    );

    //------------------------------------------------
    // Usage Date
    //------------------------------------------------

    it(
      "normalizes usage dates to UTC calendar midnight",
      () => {
        expect(
          normalizeCommunicationUsageDate(
            new Date(
              "2026-08-18T23:59:59.999Z"
            )
          ).toISOString()
        ).toBe(
          "2026-08-18T00:00:00.000Z"
        );
      }
    );

    //------------------------------------------------
    // Standard Concurrency
    //------------------------------------------------

    it(
      "accepts the second active Standard campaign",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            1
          );

        const result =
          await reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              100,
          });

        expect(
          result.activeCampaignsAfter
        ).toBe(
          2
        );

        expect(
          result.concurrencyLimit
        ).toBe(
          2
        );
      }
    );

    it(
      "rejects a third active Standard campaign",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            2
          );

        await expect(
          reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              100,
          })
        ).rejects.toMatchObject({
          code:
            COMMUNICATION_CONCURRENCY_LIMIT_REACHED,

          limit:
            2,

          current:
            2,
        });

        expect(
          mocks
            .transaction
            .communicationCampaignUsage
            .create
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Premium Concurrency
    //------------------------------------------------

    it(
      "accepts the tenth active Premium campaign",
      async () => {
        configureCampaign(
          CommunicationTier.PREMIUM
        );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            9
          );

        const result =
          await reserve({
            tier:
              CommunicationTier.PREMIUM,

            recipientCount:
              1,
          });

        expect(
          result.activeCampaignsAfter
        ).toBe(
          10
        );

        expect(
          result.concurrencyLimit
        ).toBe(
          10
        );
      }
    );

    it(
      "rejects an eleventh active Premium campaign",
      async () => {
        configureCampaign(
          CommunicationTier.PREMIUM
        );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            10
          );

        await expect(
          reserve({
            tier:
              CommunicationTier.PREMIUM,

            recipientCount:
              1,
          })
        ).rejects.toMatchObject({
          code:
            COMMUNICATION_CONCURRENCY_LIMIT_REACHED,

          limit:
            10,

          current:
            10,
        });
      }
    );

    //------------------------------------------------
    // Standard Daily Recipients
    //------------------------------------------------

    it(
      "allows Standard daily usage exactly at 5000 recipients",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        configureDailyUsed(
          4_900
        );

        const result =
          await reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              100,
          });

        expect(
          result.dailyRecipientsUsedAfter
        ).toBe(
          5_000
        );

        expect(
          result.dailyRecipientsLimit
        ).toBe(
          5_000
        );
      }
    );

    it(
      "rejects Standard daily usage above 5000 recipients",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        configureDailyUsed(
          4_900
        );

        await expect(
          reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              101,
          })
        ).rejects.toMatchObject({
          code:
            COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED,

          limit:
            5_000,

          current:
            4_900,

          requested:
            101,
        });
      }
    );

    //------------------------------------------------
    // Premium Daily Recipients
    //------------------------------------------------

    it(
      "allows Premium daily usage exactly at 100000 recipients",
      async () => {
        configureCampaign(
          CommunicationTier.PREMIUM
        );

        configureDailyUsed(
          99_999
        );

        const result =
          await reserve({
            tier:
              CommunicationTier.PREMIUM,

            recipientCount:
              1,
          });

        expect(
          result.dailyRecipientsUsedAfter
        ).toBe(
          100_000
        );
      }
    );

    it(
      "rejects Premium daily usage above 100000 recipients",
      async () => {
        configureCampaign(
          CommunicationTier.PREMIUM
        );

        configureDailyUsed(
          99_999
        );

        await expect(
          reserve({
            tier:
              CommunicationTier.PREMIUM,

            recipientCount:
              2,
          })
        ).rejects.toMatchObject({
          code:
            COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED,

          limit:
            100_000,

          current:
            99_999,

          requested:
            2,
        });
      }
    );

    //------------------------------------------------
    // Idempotent Same-Day Reservation
    //------------------------------------------------

    it(
      "does not double-count an existing active same-day reservation",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        mocks
          .transaction
          .communicationCampaignUsage
          .findUnique
          .mockResolvedValue({
            id:
              "usage-existing",

            campaignId:
              CAMPAIGN_ID,

            tier:
              CommunicationTier.STANDARD,

            usageDate:
              normalizeCommunicationUsageDate(
                USAGE_DATE
              ),

            recipientCount:
              100,

            reservedAt:
              new Date(),

            releasedAt:
              null,

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          });

        configureDailyUsed(
          5_000
        );

        const result =
          await reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              100,
          });

        expect(
          result.dailyRecipientsUsedAfter
        ).toBe(
          5_000
        );

        expect(
          mocks
            .transaction
            .communicationCampaignUsage
            .create
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Scheduled Campaign
    //------------------------------------------------

    it(
      "reserves a scheduled campaign against its future UTC execution day without consuming a slot now",
      async () => {
        configureCampaign(
          CommunicationTier.STANDARD
        );

        mocks
          .transaction
          .communicationCampaign
          .count
          .mockResolvedValue(
            2
          );

        const future =
          new Date(
            "2026-08-20T18:30:00.000Z"
          );

        const result =
          await reserve({
            tier:
              CommunicationTier.STANDARD,

            recipientCount:
              500,

            targetStatus:
              CommunicationCampaignStatus.SCHEDULED,

            usageDate:
              future,
          });

        expect(
          result.usageDate.toISOString()
        ).toBe(
          "2026-08-20T00:00:00.000Z"
        );

        expect(
          result.activeCampaignsBefore
        ).toBe(
          2
        );

        expect(
          result.activeCampaignsAfter
        ).toBe(
          2
        );
      }
    );

    //------------------------------------------------
    // Release
    //------------------------------------------------

    it(
      "releases a reservation when queueing never accepted execution",
      async () => {
        const released =
          await releaseCommunicationCampaignUsageReservation(
            CAMPAIGN_ID,
            USAGE_DATE
          );

        expect(
          released
        ).toBe(
          true
        );

        expect(
          mocks
            .prisma
            .communicationCampaignUsage
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                campaignId:
                  CAMPAIGN_ID,

                releasedAt:
                  null,
              }),
          })
        );
      }
    );
  }
);
