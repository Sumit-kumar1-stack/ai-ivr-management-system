import {
  CallStatus,
  CampaignRunStatus,
  CampaignStatus,
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

      const transactionClient = {
        campaignRun: {
          updateMany:
            vi.fn(),
        },

        campaign: {
          updateMany:
            vi.fn(),
        },
      };

      const prisma = {
        campaignRun: {
          findUnique:
            vi.fn(),

          findFirst:
            vi.fn(),

          updateMany:
            vi.fn(),
        },

        campaign: {
          updateMany:
            vi.fn(),
        },

        call: {
          findMany:
            vi.fn(),
        },

        $transaction:
          vi.fn(),
      };

      return {
        logger,

        prisma,

        transactionClient,
      };
    }
  );

//--------------------------------------------------
// Module Mocks
//--------------------------------------------------

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma:
      mocks.prisma,
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createCampaignRunLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    getDurationMs:
      vi.fn(
        () =>
          10
      ),

    normalizeError:
      vi.fn(
        (
          error: unknown
        ) => ({
          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
      ),
  })
);

//--------------------------------------------------
// Import Service After Mocks
//--------------------------------------------------

import {
  finalizeCampaignRunIfReady,
} from "@/services/campaigns/campaign-finalizer.service";

//--------------------------------------------------
// Test Fixtures
//--------------------------------------------------

const CAMPAIGN_ID =
  "campaign-1";

const CAMPAIGN_RUN_ID =
  "campaign-run-1";

const CONTACT_1 =
  "contact-1";

const CONTACT_2 =
  "contact-2";

function createCampaignRun(
  overrides:
    Partial<{
      id: string;

      campaignId: string;

      status:
        CampaignRunStatus;

      total: number;

      processed: number;

      completedAt:
        Date |
        null;
    }> = {}
) {
  return {
    id:
      CAMPAIGN_RUN_ID,

    campaignId:
      CAMPAIGN_ID,

    status:
      CampaignRunStatus.RUNNING,

    total:
      2,

    processed:
      2,

    completedAt:
      null,

    ...overrides,
  };
}

function createCall(
  overrides:
    Partial<{
      id: string;

      contactId: string;

      status:
        CallStatus;

      attemptNumber:
        number;

      maxAttempts:
        number;

      nextRetryAt:
        Date |
        null;

      createdAt:
        Date;
    }> = {}
) {
  return {
    id:
      "call-1",

    contactId:
      CONTACT_1,

    status:
      CallStatus.COMPLETED,

    attemptNumber:
      1,

    maxAttempts:
      3,

    nextRetryAt:
      null,

    createdAt:
      new Date(
        "2026-07-25T00:00:00.000Z"
      ),

    ...overrides,
  };
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "finalizeCampaignRunIfReady",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks
          .transactionClient
          .campaignRun
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });

        mocks
          .transactionClient
          .campaign
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });

        mocks
          .prisma
          .campaignRun
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });

        mocks
          .prisma
          .campaign
          .updateMany
          .mockResolvedValue({
            count:
              1,
          });

        /*
         * Supports both Prisma transaction forms:
         *
         * prisma.$transaction(async tx => ...)
         * prisma.$transaction([query1, query2])
         */
        mocks
          .prisma
          .$transaction
          .mockImplementation(
            async (
              operation:
                unknown
            ) => {
              if (
                typeof operation ===
                "function"
              ) {
                return operation(
                  mocks
                    .transactionClient
                );
              }

              if (
                Array.isArray(
                  operation
                )
              ) {
                return Promise.all(
                  operation
                );
              }

              throw new Error(
                "Unsupported transaction input"
              );
            }
          );
      }
    );

    //------------------------------------------------
    // Missing Run
    //------------------------------------------------

    it(
      "throws when the campaign run does not exist",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            null
          );

        await expect(
          finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          )
        ).rejects.toThrow(
          `Campaign run not found: ${CAMPAIGN_RUN_ID}`
        );
      }
    );

    //------------------------------------------------
    // Already Terminal
    //------------------------------------------------

    it.each([
      CampaignRunStatus.COMPLETED,
      CampaignRunStatus.FAILED,
      CampaignRunStatus.CANCELLED,
    ])(
      "skips a campaign run already in terminal status %s",
      async status => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              status,
            })
          );

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            false,

          skipped:
            true,

          reason:
            "Campaign run is already in a terminal state",

          runStatus:
            status,
        });

        expect(
          mocks
            .prisma
            .call
            .findMany
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Dispatch Still Running
    //------------------------------------------------

    it(
      "does not finalize while initial campaign dispatch is still running",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                5,

              processed:
                3,
            })
          );

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            false,

          skipped:
            true,

          reason:
            "Initial campaign dispatch is still running",

          totalContacts:
            5,

          processedContacts:
            3,

          unresolvedContacts:
            2,
        });

        expect(
          mocks
            .prisma
            .call
            .findMany
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Empty Campaign
    //------------------------------------------------

    it(
      "finalizes an empty campaign as completed",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                0,

              processed:
                0,
            })
          );

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            true,

          skipped:
            false,

          reason:
            "Empty campaign run finalized",

          runStatus:
            CampaignRunStatus.COMPLETED,

          totalContacts:
            0,
        });

        expect(
          mocks
            .prisma
            .campaignRun
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                id:
                  CAMPAIGN_RUN_ID,
              }),

            data:
              expect.objectContaining({
                status:
                  CampaignRunStatus.COMPLETED,
              }),
          })
        );

        expect(
          mocks
            .prisma
            .campaign
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                id:
                  CAMPAIGN_ID,
              }),

            data:
              expect.objectContaining({
                status:
                  CampaignStatus.COMPLETED,
              }),
          })
        );
      }
    );

    //------------------------------------------------
    // Unresolved Call
    //------------------------------------------------

    it(
      "does not finalize when a latest call attempt is non-terminal",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun()
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              contactId:
                CONTACT_1,

              status:
                CallStatus.ANSWERED,
            }),

            createCall({
              id:
                "call-2",

              contactId:
                CONTACT_2,

              status:
                CallStatus.COMPLETED,
            }),
          ]);

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            false,

          skipped:
            true,

          reason:
            "Calls or retries are still unresolved",

          runStatus:
            CampaignRunStatus.RUNNING,

          settledContacts:
            1,

          unresolvedContacts:
            1,

          completedContacts:
            1,
        });

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Pending Retry
    //------------------------------------------------

    it(
      "does not finalize when a terminal call has a pending retry",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                1,

              processed:
                1,
            })
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              status:
                CallStatus.NO_ANSWER,

              nextRetryAt:
                new Date(
                  "2026-07-25T03:00:00.000Z"
                ),
            }),
          ]);

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            false,

          skipped:
            true,

          reason:
            "Calls or retries are still unresolved",

          unresolvedContacts:
            1,

          settledContacts:
            0,
        });
      }
    );

    //------------------------------------------------
    // Latest Attempt Selection
    //------------------------------------------------

    it(
      "uses the latest attempt for each contact",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                1,

              processed:
                1,
            })
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              id:
                "attempt-2",

              status:
                CallStatus.COMPLETED,

              attemptNumber:
                2,

              createdAt:
                new Date(
                  "2026-07-25T02:00:00.000Z"
                ),
            }),

            createCall({
              id:
                "attempt-1",

              status:
                CallStatus.NO_ANSWER,

              attemptNumber:
                1,

              createdAt:
                new Date(
                  "2026-07-25T01:00:00.000Z"
                ),
            }),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              CAMPAIGN_RUN_ID,
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            true,

          runStatus:
            CampaignRunStatus.COMPLETED,

          completedContacts:
            1,

          unsuccessfulContacts:
            0,
        });
      }
    );

    //------------------------------------------------
    // Successful Completion
    //------------------------------------------------

    it(
      "marks the run and campaign completed when at least one contact completed",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun()
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              contactId:
                CONTACT_1,

              status:
                CallStatus.COMPLETED,
            }),

            createCall({
              id:
                "call-2",

              contactId:
                CONTACT_2,

              status:
                CallStatus.NO_ANSWER,
            }),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              CAMPAIGN_RUN_ID,
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            true,

          skipped:
            false,

          runStatus:
            CampaignRunStatus.COMPLETED,

          settledContacts:
            2,

          completedContacts:
            1,

          unsuccessfulContacts:
            1,
        });

        expect(
          mocks
            .transactionClient
            .campaignRun
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  CampaignRunStatus.COMPLETED,
              }),
          })
        );

        expect(
          mocks
            .transactionClient
            .campaign
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  CampaignStatus.COMPLETED,
              }),
          })
        );
      }
    );

    //------------------------------------------------
    // Failed Completion
    //------------------------------------------------

    it(
      "marks the run and campaign failed when every contact is unsuccessful",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun()
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              contactId:
                CONTACT_1,

              status:
                CallStatus.FAILED,
            }),

            createCall({
              id:
                "call-2",

              contactId:
                CONTACT_2,

              status:
                CallStatus.BUSY,
            }),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              CAMPAIGN_RUN_ID,
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            true,

          runStatus:
            CampaignRunStatus.FAILED,

          completedContacts:
            0,

          unsuccessfulContacts:
            2,
        });

        expect(
          mocks
            .transactionClient
            .campaignRun
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  CampaignRunStatus.FAILED,
              }),
          })
        );

        expect(
          mocks
            .transactionClient
            .campaign
            .updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  CampaignStatus.FAILED,
              }),
          })
        );
      }
    );

    //------------------------------------------------
    // Contact Without Call
    //------------------------------------------------

    it(
      "counts a processed contact without a call record as unsuccessful",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                2,

              processed:
                2,
            })
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall({
              contactId:
                CONTACT_1,

              status:
                CallStatus.COMPLETED,
            }),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              CAMPAIGN_RUN_ID,
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            true,

          completedContacts:
            1,

          unsuccessfulContacts:
            1,

          settledContacts:
            2,
        });
      }
    );

    //------------------------------------------------
    // Older Campaign Run
    //------------------------------------------------

    it(
      "does not let an older run overwrite the parent campaign status",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                1,

              processed:
                1,
            })
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall(),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              "newer-run-id",
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result.finalized
        ).toBe(
          true
        );

        expect(
          mocks
            .transactionClient
            .campaignRun
            .updateMany
        ).toHaveBeenCalledOnce();

        expect(
          mocks
            .transactionClient
            .campaign
            .updateMany
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Concurrent Finalization
    //------------------------------------------------

    it(
      "reports a concurrent skip when another process finalized the run first",
      async () => {
        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockResolvedValue(
            createCampaignRun({
              total:
                1,

              processed:
                1,
            })
          );

        mocks
          .prisma
          .call
          .findMany
          .mockResolvedValue([
            createCall(),
          ]);

        mocks
          .prisma
          .campaignRun
          .findFirst
          .mockResolvedValue({
            id:
              CAMPAIGN_RUN_ID,
          });

        mocks
          .transactionClient
          .campaignRun
          .updateMany
          .mockResolvedValue({
            count:
              0,
          });

        const result =
          await finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          );

        expect(
          result
        ).toMatchObject({
          finalized:
            false,

          skipped:
            true,

          reason:
            "Campaign run was finalized by another process",

          runStatus:
            CampaignRunStatus.COMPLETED,
        });
      }
    );

    //------------------------------------------------
    // Database Failure
    //------------------------------------------------

    it(
      "logs and rethrows unexpected database failures",
      async () => {
        const databaseError =
          new Error(
            "Database unavailable"
          );

        mocks
          .prisma
          .campaignRun
          .findUnique
          .mockRejectedValue(
            databaseError
          );

        await expect(
          finalizeCampaignRunIfReady(
            CAMPAIGN_RUN_ID
          )
        ).rejects.toThrow(
          "Database unavailable"
        );

        expect(
          mocks
            .logger
            .error
        ).toHaveBeenCalled();
      }
    );
  }
);