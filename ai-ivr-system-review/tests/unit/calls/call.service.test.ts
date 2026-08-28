import {
  CallStatus,
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

      const prisma = {
        call: {
          create:
            vi.fn(),

          findFirst:
            vi.fn(),

          findUnique:
            vi.fn(),

          update:
            vi.fn(),
        },
      };

      const retryQueue = {
        enqueue:
          vi.fn(),
      };

      const finalizer = {
        finalize:
          vi.fn(),
      };

      return {
        logger,
        prisma,
        retryQueue,
        finalizer,
      };
    }
  );

//--------------------------------------------------
// Dependency Mocks
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
    createLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    createCallLogger:
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

vi.mock(
  "@/services/calls/call-retry-queue.service",
  () => ({
    CallRetryQueueService: {
      enqueue:
        mocks.retryQueue.enqueue,
    },
  })
);

vi.mock(
  "@/services/campaigns/campaign-finalizer.service",
  () => ({
    finalizeCampaignRunIfReady:
      mocks.finalizer.finalize,
  })
);

//--------------------------------------------------
// Import Service After Mocks
//--------------------------------------------------

import {
  createCall,
  updateCallStatus,
} from "@/services/calls/call.service";

//--------------------------------------------------
// Test Constants
//--------------------------------------------------

const CALL_ID =
  "call-1";

const CAMPAIGN_ID =
  "campaign-1";

const CAMPAIGN_RUN_ID =
  "campaign-run-1";

const CONTACT_ID =
  "contact-1";

const PROVIDER_CALL_ID =
  "CA123456789";

//--------------------------------------------------
// Fixtures
//--------------------------------------------------

function createStoredCall(
  overrides:
    Partial<{
      id: string;

      campaignId: string;

      campaignRunId:
        string |
        null;

      contactId: string;

      status: CallStatus;

      providerCallId:
        string |
        null;

      duration:
        number |
        null;

      attemptNumber:
        number;

      maxAttempts:
        number;

      retryOfCallId:
        string |
        null;

      nextRetryAt:
        Date |
        null;

      retryReason:
        string |
        null;

      queuedAt:
        Date |
        null;

      ringingAt:
        Date |
        null;

      answeredAt:
        Date |
        null;

      completedAt:
        Date |
        null;

      failedAt:
        Date |
        null;

      startedAt:
        Date |
        null;

      endedAt:
        Date |
        null;
    }> = {}
) {
  return {
    id:
      CALL_ID,

    campaignId:
      CAMPAIGN_ID,

    campaignRunId:
      CAMPAIGN_RUN_ID,

    contactId:
      CONTACT_ID,

    status:
      CallStatus.QUEUED,

    providerCallId:
      PROVIDER_CALL_ID,

    duration:
      null,

    attemptNumber:
      1,

    maxAttempts:
      3,

    retryOfCallId:
      null,

    nextRetryAt:
      null,

    retryReason:
      null,

    queuedAt:
      null,

    ringingAt:
      null,

    answeredAt:
      null,

    completedAt:
      null,

    failedAt:
      null,

    startedAt:
      null,

    endedAt:
      null,

    ...overrides,
  };
}

function createCreatedCall(
  overrides:
    Record<
      string,
      unknown
    > = {}
) {
  return {
    id:
      CALL_ID,

    campaignId:
      CAMPAIGN_ID,

    campaignRunId:
      CAMPAIGN_RUN_ID,

    contactId:
      CONTACT_ID,

    contactPhoneSnapshot:
      "+919876543210",

    providerDestination:
      "+919876543210",

    usedDevelopmentOverride:
      false,

    destinationOverrideSource:
      null,

    language:
      "English",

    attemptNumber:
      1,

    maxAttempts:
      3,

    retryOfCallId:
      null,

    retryReason:
      null,

    nextRetryAt:
      null,

    providerCallId:
      null,

    status:
      CallStatus.QUEUED,

    ...overrides,
  };
}

function mockFinalizationResult() {
  mocks
    .finalizer
    .finalize
    .mockResolvedValue({
      finalized:
        false,

      skipped:
        true,

      reason:
        "Calls or retries are still unresolved",

      runStatus:
        "RUNNING",

      settledContacts:
        0,

      unresolvedContacts:
        1,
    });
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "call service",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-25T10:00:00.000Z"
          )
        );

        mocks
          .retryQueue
          .enqueue
          .mockResolvedValue({
            id:
              "retry-job-1",
          });

        mockFinalizationResult();
      }
    );

    //------------------------------------------------
    // createCall Validation
    //------------------------------------------------

    describe(
      "createCall",
      () => {
        const validInput = {
          campaignId:
            CAMPAIGN_ID,

          campaignRunId:
            CAMPAIGN_RUN_ID,

          contactId:
            CONTACT_ID,

          contactPhoneSnapshot:
            "+919876543210",

          providerDestination:
            "+919876543210",

          usedDevelopmentOverride:
            false,

          language:
            "English",
        };

        it(
          "creates a queued internal call with default attempt values",
          async () => {
            const storedCall =
              createCreatedCall();

            mocks
              .prisma
              .call
              .create
              .mockResolvedValue(
                storedCall
              );

            const result =
              await createCall(
                validInput
              );

            expect(
              result
            ).toEqual({
              call:
                storedCall,

              created:
                true,
            });

            expect(
              mocks
                .prisma
                .call
                .create
            ).toHaveBeenCalledWith({
              data:
                expect.objectContaining({
                  campaignId:
                    CAMPAIGN_ID,

                  campaignRunId:
                    CAMPAIGN_RUN_ID,

                  contactId:
                    CONTACT_ID,

                  attemptNumber:
                    1,

                  maxAttempts:
                    3,

                  status:
                    CallStatus.QUEUED,
                }),
            });
          }
        );

        it.each([
          0,
          -1,
          1.5,
        ])(
          "rejects invalid attempt number %s",
          async attemptNumber => {
            await expect(
              createCall({
                ...validInput,

                attemptNumber,
              })
            ).rejects.toThrow(
              "Call attempt number must be a positive integer"
            );

            expect(
              mocks
                .prisma
                .call
                .create
            ).not.toHaveBeenCalled();
          }
        );

        it.each([
          0,
          -1,
          2.5,
        ])(
          "rejects invalid maximum attempts %s",
          async maxAttempts => {
            await expect(
              createCall({
                ...validInput,

                maxAttempts,
              })
            ).rejects.toThrow(
              "Maximum call attempts must be a positive integer"
            );
          }
        );

        it(
          "rejects an attempt number greater than maximum attempts",
          async () => {
            await expect(
              createCall({
                ...validInput,

                attemptNumber:
                  4,

                maxAttempts:
                  3,
              })
            ).rejects.toThrow(
              "Call attempt number cannot exceed maximum attempts"
            );
          }
        );
      }
    );

    //------------------------------------------------
    // updateCallStatus
    //------------------------------------------------

    describe(
      "updateCallStatus",
      () => {
        it(
          "ignores a callback that does not match an internal call",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                null
              );

            mocks
              .prisma
              .call
              .findFirst
              .mockResolvedValue(
                null
              );

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "ringing",
              });

            expect(
              result
            ).toEqual({
              count:
                0,

              ignored:
                true,

              retryScheduled:
                false,
            });

            expect(
              mocks
                .prisma
                .call
                .update
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "moves a queued call to ringing and stores the first ringing timestamp",
          async () => {
            const existingCall =
              createStoredCall({
                status:
                  CallStatus.QUEUED,

                ringingAt:
                  null,
              });

            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                existingCall
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.RINGING,

                nextRetryAt:
                  null,

                duration:
                  null,
              });

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "ringing",
              });

            expect(
              mocks
                .prisma
                .call
                .update
            ).toHaveBeenCalledWith({
              where: {
                id:
                  CALL_ID,
              },

              data: {
                status:
                  CallStatus.RINGING,

                ringingAt:
                  new Date(
                    "2026-07-25T10:00:00.000Z"
                  ),
              },

              select: {
                id:
                  true,

                status:
                  true,

                nextRetryAt:
                  true,

                duration:
                  true,
              },
            });

            expect(
              result
            ).toMatchObject({
              status:
                CallStatus.RINGING,

              previousStatus:
                CallStatus.QUEUED,

              ignored:
                false,

              terminalTransition:
                false,

              retryScheduled:
                false,
            });
          }
        );

        it(
          "sets answered and started timestamps on the first answered callback",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.RINGING,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.ANSWERED,

                nextRetryAt:
                  null,

                duration:
                  null,
              });

            await updateCallStatus({
              callId:
                CALL_ID,

              providerCallId:
                PROVIDER_CALL_ID,

              status:
                "in-progress",
            });

            expect(
              mocks
                .prisma
                .call
                .update
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                data: {
                  status:
                    CallStatus.ANSWERED,

                  answeredAt:
                    new Date(
                      "2026-07-25T10:00:00.000Z"
                    ),

                  startedAt:
                    new Date(
                      "2026-07-25T10:00:00.000Z"
                    ),
                },
              })
            );
          }
        );

        it(
          "ignores an out-of-order callback from answered back to ringing",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.ANSWERED,

                  answeredAt:
                    new Date(
                      "2026-07-25T09:59:00.000Z"
                    ),

                  startedAt:
                    new Date(
                      "2026-07-25T09:59:00.000Z"
                    ),
                })
              );

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "ringing",
              });

            expect(
              result
            ).toMatchObject({
              status:
                CallStatus.ANSWERED,

              previousStatus:
                CallStatus.ANSWERED,

              ignored:
                true,

              duplicate:
                false,

              terminalTransition:
                false,
            });

            expect(
              mocks
                .prisma
                .call
                .update
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "protects a completed call from a later failed callback",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.COMPLETED,

                  completedAt:
                    new Date(
                      "2026-07-25T09:59:00.000Z"
                    ),

                  endedAt:
                    new Date(
                      "2026-07-25T09:59:00.000Z"
                    ),
                })
              );

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "failed",
              });

            expect(
              result
            ).toMatchObject({
              status:
                CallStatus.COMPLETED,

              ignored:
                true,

              terminalTransition:
                false,

              retryScheduled:
                false,
            });

            expect(
              mocks
                .prisma
                .call
                .update
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "completes an answered call and calculates duration from startedAt",
          async () => {
            const startedAt =
              new Date(
                "2026-07-25T09:58:30.000Z"
              );

            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.ANSWERED,

                  startedAt,

                  answeredAt:
                    startedAt,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.COMPLETED,

                nextRetryAt:
                  null,

                duration:
                  90,
              });

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "completed",
              });

            expect(
              mocks
                .prisma
                .call
                .update
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                data:
                  expect.objectContaining({
                    status:
                      CallStatus.COMPLETED,

                    completedAt:
                      new Date(
                        "2026-07-25T10:00:00.000Z"
                      ),

                    endedAt:
                      new Date(
                        "2026-07-25T10:00:00.000Z"
                      ),

                    duration:
                      90,

                    nextRetryAt:
                      null,

                    retryReason:
                      null,
                  }),
              })
            );

            expect(
              mocks
                .retryQueue
                .enqueue
            ).not.toHaveBeenCalled();

            expect(
              mocks
                .finalizer
                .finalize
            ).toHaveBeenCalledWith(
              CAMPAIGN_RUN_ID
            );

            expect(
              result
            ).toMatchObject({
              status:
                CallStatus.COMPLETED,

              terminalTransition:
                true,

              retryScheduled:
                false,
            });
          }
        );

        it(
          "uses a valid provider duration instead of calculating it",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.ANSWERED,

                  startedAt:
                    new Date(
                      "2026-07-25T09:50:00.000Z"
                    ),
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.COMPLETED,

                nextRetryAt:
                  null,

                duration:
                  42,
              });

            await updateCallStatus({
              callId:
                CALL_ID,

              providerCallId:
                PROVIDER_CALL_ID,

              status:
                "completed",

              duration:
                42.9,
            });

            expect(
              mocks
                .prisma
                .call
                .update
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                data:
                  expect.objectContaining({
                    duration:
                      42,
                  }),
              })
            );
          }
        );

        it(
          "schedules a delayed retry after a no-answer terminal transition",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.RINGING,

                  maxAttempts:
                    3,

                  attemptNumber:
                    1,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValueOnce({
                id:
                  CALL_ID,

                status:
                  CallStatus.NO_ANSWER,

                nextRetryAt:
                  null,

                duration:
                  null,
              })
              .mockResolvedValueOnce({
                id:
                  CALL_ID,
              });

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "no-answer",
              });

            expect(
              mocks
                .retryQueue
                .enqueue
            ).toHaveBeenCalledWith(
              {
                originalCallId:
                  CALL_ID,

                campaignId:
                  CAMPAIGN_ID,

                campaignRunId:
                  CAMPAIGN_RUN_ID,

                contactId:
                  CONTACT_ID,

                attemptNumber:
                  2,

                maxAttempts:
                  3,

                retryReason:
                  "Contact did not answer",
              },
              2 *
              60 *
              60 *
              1000
            );

            expect(
              result.retryScheduled
            ).toBe(
              true
            );

            expect(
              mocks
                .finalizer
                .finalize
            ).toHaveBeenCalledWith(
              CAMPAIGN_RUN_ID
            );
          }
        );

        it(
          "does not retry after maximum attempts have been reached",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.RINGING,

                  attemptNumber:
                    3,

                  maxAttempts:
                    3,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.NO_ANSWER,

                nextRetryAt:
                  null,

                duration:
                  null,
              });

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "no-answer",
              });

            expect(
              mocks
                .retryQueue
                .enqueue
            ).not.toHaveBeenCalled();

            expect(
              result.retryScheduled
            ).toBe(
              false
            );
          }
        );

        it(
          "clears retry timestamp when retry queue insertion fails",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.RINGING,

                  attemptNumber:
                    1,

                  maxAttempts:
                    3,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValueOnce({
                id:
                  CALL_ID,

                status:
                  CallStatus.BUSY,

                nextRetryAt:
                  null,

                duration:
                  null,
              })
              .mockResolvedValueOnce({
                id:
                  CALL_ID,
              })
              .mockResolvedValueOnce({
                id:
                  CALL_ID,
              });

            mocks
              .retryQueue
              .enqueue
              .mockRejectedValue(
                new Error(
                  "Redis unavailable"
                )
              );

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "busy",
              });

            expect(
              mocks
                .prisma
                .call
                .update
            ).toHaveBeenLastCalledWith({
              where: {
                id:
                  CALL_ID,
              },

              data: {
                nextRetryAt:
                  null,
              },
            });

            expect(
              result.retryScheduled
            ).toBe(
              false
            );
          }
        );

        it(
          "does not fail the callback when campaign finalization throws",
          async () => {
            mocks
              .prisma
              .call
              .findUnique
              .mockResolvedValue(
                createStoredCall({
                  status:
                    CallStatus.ANSWERED,
                })
              );

            mocks
              .prisma
              .call
              .update
              .mockResolvedValue({
                id:
                  CALL_ID,

                status:
                  CallStatus.COMPLETED,

                nextRetryAt:
                  null,

                duration:
                  10,
              });

            mocks
              .finalizer
              .finalize
              .mockRejectedValue(
                new Error(
                  "Finalizer unavailable"
                )
              );

            const result =
              await updateCallStatus({
                callId:
                  CALL_ID,

                providerCallId:
                  PROVIDER_CALL_ID,

                status:
                  "completed",

                duration:
                  10,
              });

            expect(
              result
            ).toMatchObject({
              count:
                1,

              status:
                CallStatus.COMPLETED,

              terminalTransition:
                true,

              ignored:
                false,
            });

            expect(
              mocks
                .logger
                .error
            ).toHaveBeenCalled();
          }
        );
      }
    );
  }
);