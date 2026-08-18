import {
  CommunicationCampaignStatus,
  CommunicationTier,
  Prisma,
} from "@prisma/client";

import {
  getCommunicationPlanForTier,
  type CommunicationPlan,
} from "@/config/communication-plan";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "communication-usage-limit"
  );

//--------------------------------------------------
// Error Codes
//--------------------------------------------------

export const COMMUNICATION_CONCURRENCY_LIMIT_REACHED =
  "COMMUNICATION_CONCURRENCY_LIMIT_REACHED" as const;

export const COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED =
  "COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED" as const;

export const COMMUNICATION_LAUNCH_CONFLICT =
  "COMMUNICATION_LAUNCH_CONFLICT" as const;

export type CommunicationUsageLimitErrorCode =
  | typeof COMMUNICATION_CONCURRENCY_LIMIT_REACHED
  | typeof COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED
  | typeof COMMUNICATION_LAUNCH_CONFLICT;

//--------------------------------------------------
// Usage Limit Error
//--------------------------------------------------

export class CommunicationUsageLimitError extends Error {
  readonly code:
    CommunicationUsageLimitErrorCode;

  readonly tier:
    CommunicationTier;

  readonly limit:
    number;

  readonly current:
    number;

  readonly requested:
    number;

  constructor(
    input: {
      code:
        CommunicationUsageLimitErrorCode;

      message:
        string;

      tier:
        CommunicationTier;

      limit:
        number;

      current:
        number;

      requested:
        number;
    }
  ) {
    super(
      input.message
    );

    this.name =
      "CommunicationUsageLimitError";

    this.code =
      input.code;

    this.tier =
      input.tier;

    this.limit =
      input.limit;

    this.current =
      input.current;

    this.requested =
      input.requested;
  }
}

//--------------------------------------------------
// Type Guard
//--------------------------------------------------

export function isCommunicationUsageLimitError(
  error:
    unknown
): error is CommunicationUsageLimitError {
  return (
    error instanceof
      CommunicationUsageLimitError
  );
}

//--------------------------------------------------
// Reservation Input
//--------------------------------------------------

export interface ReserveCommunicationCampaignLaunchInput {
  campaignId:
    string;

  tier:
    CommunicationTier;

  recipientCount:
    number;

  usageDate:
    Date;

  targetStatus:
    CommunicationCampaignStatus;
}

//--------------------------------------------------
// Reservation Result
//--------------------------------------------------

export interface CommunicationCampaignUsageReservation {
  campaignId:
    string;

  tier:
    CommunicationTier;

  plan:
    CommunicationPlan;

  usageDate:
    Date;

  reservationCreated:
    boolean;

  reservationReactivated:
    boolean;

  activeCampaignsBefore:
    number;

  activeCampaignsAfter:
    number;

  concurrencyLimit:
    number;

  dailyRecipientsUsedBefore:
    number;

  dailyRecipientsUsedAfter:
    number;

  dailyRecipientsLimit:
    number;
}

//--------------------------------------------------
// Active Campaign Statuses
//
// Concurrency here means campaign orchestration work
// that has been accepted by the queue and has not yet
// finished its initial dispatch phase.
//
// SCHEDULED is intentionally excluded: a future job
// does not consume an execution slot until BullMQ
// activates it. The worker is separately capped by
// the current account plan.
//
// DISPATCHED is also excluded: initial orchestration
// has completed and child voice/messaging lifecycles
// own their own execution state from that point.
//--------------------------------------------------

const ACTIVE_CAMPAIGN_STATUSES = [
  CommunicationCampaignStatus.QUEUED,
  CommunicationCampaignStatus.RUNNING,
] as const;

//--------------------------------------------------
// Normalize Usage Day
//--------------------------------------------------

export function normalizeCommunicationUsageDate(
  value:
    Date
): Date {
  const timestamp =
    value.getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    throw new Error(
      "Communication usage date is invalid"
    );
  }

  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

//--------------------------------------------------
// Reserve Launch
//
// This transaction owns three things together:
//
// 1. concurrency check
// 2. daily-recipient reservation
// 3. campaign status claim
//
// PostgreSQL advisory transaction locks serialize
// launch decisions for the same tier and usage day,
// preventing two simultaneous API requests from both
// observing capacity and oversubscribing the plan.
//--------------------------------------------------

export async function reserveCommunicationCampaignLaunch(
  input:
    ReserveCommunicationCampaignLaunchInput
): Promise<CommunicationCampaignUsageReservation> {
  const campaignId =
    input
      .campaignId
      .trim();

  if (
    !campaignId
  ) {
    throw new Error(
      "Communication campaign ID is required for usage reservation"
    );
  }

  if (
    !Number.isInteger(
      input.recipientCount
    ) ||
    input.recipientCount <=
      0
  ) {
    throw new Error(
      "Communication campaign recipient count must be a positive integer"
    );
  }

  if (
    input.targetStatus !==
      CommunicationCampaignStatus.QUEUED &&
    input.targetStatus !==
      CommunicationCampaignStatus.SCHEDULED
  ) {
    throw new Error(
      "Communication campaign launch target must be QUEUED or SCHEDULED"
    );
  }

  const usageDate =
    normalizeCommunicationUsageDate(
      input.usageDate
    );

  const plan =
    getCommunicationPlanForTier(
      input.tier
    );

  //------------------------------------------------
  // Snapshot Tier Must Be Valid
  //------------------------------------------------

  if (
    plan.tier !==
    input.tier
  ) {
    throw new Error(
      "Communication campaign has an invalid subscription tier"
    );
  }

  try {
    return await prisma
      .$transaction(
        async transaction => {
          //------------------------------------------------
          // Serialize Usage Decisions
          //------------------------------------------------

          const lockKey =
            [
              "communication-plan-usage",
              input.tier,
              usageDate
                .toISOString()
                .slice(
                  0,
                  10
                ),
            ].join(
              ":"
            );

          await transaction
            .$queryRaw<
              Array<{
                pg_advisory_xact_lock:
                  unknown;
              }>
            >`
              SELECT pg_advisory_xact_lock(
                hashtext(${lockKey})
              )
            `;

          //------------------------------------------------
          // Verify Campaign Still Exists / Tier Matches
          //------------------------------------------------

          const currentCampaign =
            await transaction
              .communicationCampaign
              .findUnique({
                where: {
                  id:
                    campaignId,
                },

                select: {
                  id:
                    true,

                  tier:
                    true,

                  status:
                    true,
                },
              });

          if (
            !currentCampaign
          ) {
            throw new Error(
              "Communication campaign not found"
            );
          }

          if (
            currentCampaign.tier !==
            input.tier
          ) {
            throw new Error(
              "Communication campaign tier changed before launch"
            );
          }

          //------------------------------------------------
          // Concurrency
          //
          // Only immediate launches consume a slot now.
          // Scheduled jobs are constrained when workers
          // activate them by the plan-aware worker cap.
          //------------------------------------------------

          const activeCampaignsBefore =
            await transaction
              .communicationCampaign
              .count({
                where: {
                  tier:
                    input.tier,

                  id: {
                    not:
                      campaignId,
                  },

                  status: {
                    in:
                      [
                        ...ACTIVE_CAMPAIGN_STATUSES,
                      ],
                  },
                },
              });

          const consumesSlotNow =
            input.targetStatus ===
            CommunicationCampaignStatus.QUEUED;

          if (
            consumesSlotNow &&
            activeCampaignsBefore >=
              plan
                .limits
                .campaignConcurrency
          ) {
            const error =
              new CommunicationUsageLimitError({
                code:
                  COMMUNICATION_CONCURRENCY_LIMIT_REACHED,

                message:
                  `${plan.label} allows ${plan.limits.campaignConcurrency.toLocaleString(
                    "en-US"
                  )} concurrent communication campaigns. Wait for an active campaign to finish initial dispatch before launching another.`,

                tier:
                  input.tier,

                limit:
                  plan
                    .limits
                    .campaignConcurrency,

                current:
                  activeCampaignsBefore,

                requested:
                  1,
              });

            log.warn(
              {
                event:
                  "communication.usage.concurrency_rejected",

                campaignId,

                tier:
                  input.tier,

                activeCampaigns:
                  activeCampaignsBefore,

                concurrencyLimit:
                  plan
                    .limits
                    .campaignConcurrency,
              },
              "Communication campaign launch rejected by concurrency limit"
            );

            throw error;
          }

          //------------------------------------------------
          // Existing Reservation
          //------------------------------------------------

          const existingReservation =
            await transaction
              .communicationCampaignUsage
              .findUnique({
                where: {
                  campaignId_usageDate: {
                    campaignId,
                    usageDate,
                  },
                },
              });

          //------------------------------------------------
          // Daily Usage Before This Reservation
          //------------------------------------------------

          const aggregate =
            await transaction
              .communicationCampaignUsage
              .aggregate({
                where: {
                  tier:
                    input.tier,

                  usageDate,

                  releasedAt:
                    null,
                },

                _sum: {
                  recipientCount:
                    true,
                },
              });

          const dailyRecipientsUsedBefore =
            aggregate
              ._sum
              .recipientCount ??
            0;

          const alreadyReserved =
            Boolean(
              existingReservation &&
              !existingReservation
                .releasedAt
            );

          const additionalRecipients =
            alreadyReserved
              ? 0
              : input.recipientCount;

          const projectedDailyRecipients =
            dailyRecipientsUsedBefore +
            additionalRecipients;

          if (
            projectedDailyRecipients >
            plan
              .limits
              .dailyRecipients
          ) {
            const error =
              new CommunicationUsageLimitError({
                code:
                  COMMUNICATION_DAILY_RECIPIENT_LIMIT_REACHED,

                message:
                  `${plan.label} daily recipient limit is ${plan.limits.dailyRecipients.toLocaleString(
                    "en-US"
                  )}. ${dailyRecipientsUsedBefore.toLocaleString(
                    "en-US"
                  )} recipients are already reserved for ${formatUsageDate(
                    usageDate
                  )}; this campaign requests ${input.recipientCount.toLocaleString(
                    "en-US"
                  )}.`,

                tier:
                  input.tier,

                limit:
                  plan
                    .limits
                    .dailyRecipients,

                current:
                  dailyRecipientsUsedBefore,

                requested:
                  input.recipientCount,
              });

            log.warn(
              {
                event:
                  "communication.usage.daily_recipient_rejected",

                campaignId,

                tier:
                  input.tier,

                usageDate:
                  usageDate
                    .toISOString(),

                dailyRecipientsUsedBefore,

                requestedRecipients:
                  input.recipientCount,

                projectedDailyRecipients,

                dailyRecipientsLimit:
                  plan
                    .limits
                    .dailyRecipients,
              },
              "Communication campaign launch rejected by daily recipient limit"
            );

            throw error;
          }

          //------------------------------------------------
          // Reserve / Reactivate Daily Usage
          //------------------------------------------------

          let reservationCreated =
            false;

          let reservationReactivated =
            false;

          if (
            !existingReservation
          ) {
            await transaction
              .communicationCampaignUsage
              .create({
                data: {
                  campaignId,

                  tier:
                    input.tier,

                  usageDate,

                  recipientCount:
                    input.recipientCount,
                },
              });

            reservationCreated =
              true;
          } else if (
            existingReservation
              .releasedAt
          ) {
            await transaction
              .communicationCampaignUsage
              .update({
                where: {
                  id:
                    existingReservation.id,
                },

                data: {
                  tier:
                    input.tier,

                  recipientCount:
                    input.recipientCount,

                  reservedAt:
                    new Date(),

                  releasedAt:
                    null,
                },
              });

            reservationReactivated =
              true;
          } else if (
            existingReservation
              .recipientCount !==
            input.recipientCount
          ) {
            //------------------------------------------------
            // Fail closed if a previously-reserved campaign
            // somehow changed audience size after reservation.
            //------------------------------------------------

            throw new Error(
              "Communication campaign recipient count changed after daily usage was reserved"
            );
          }

          //------------------------------------------------
          // Atomic Campaign Claim
          //------------------------------------------------

          const claimed =
            await transaction
              .communicationCampaign
              .updateMany({
                where: {
                  id:
                    campaignId,

                  tier:
                    input.tier,

                  status: {
                    in: [
                      CommunicationCampaignStatus.DRAFT,
                      CommunicationCampaignStatus.READY,
                      CommunicationCampaignStatus.FAILED,
                    ],
                  },
                },

                data: {
                  status:
                    input.targetStatus,
                },
              });

          if (
            claimed.count ===
            0
          ) {
            const latest =
              await transaction
                .communicationCampaign
                .findUnique({
                  where: {
                    id:
                      campaignId,
                  },

                  select: {
                    status:
                      true,
                  },
                });

            throw new CommunicationUsageLimitError({
              code:
                COMMUNICATION_LAUNCH_CONFLICT,

              message:
                latest
                  ? `Communication campaign cannot be launched while status is ${latest.status}`
                  : "Communication campaign not found",

              tier:
                input.tier,

              limit:
                plan
                  .limits
                  .campaignConcurrency,

              current:
                activeCampaignsBefore,

              requested:
                1,
            });
          }

          const dailyRecipientsUsedAfter =
            alreadyReserved
              ? dailyRecipientsUsedBefore
              : projectedDailyRecipients;

          const activeCampaignsAfter =
            consumesSlotNow
              ? activeCampaignsBefore +
                1
              : activeCampaignsBefore;

          log.info(
            {
              event:
                "communication.usage.launch_reserved",

              campaignId,

              tier:
                input.tier,

              targetStatus:
                input.targetStatus,

              usageDate:
                usageDate
                  .toISOString(),

              reservationCreated,

              reservationReactivated,

              activeCampaignsBefore,

              activeCampaignsAfter,

              concurrencyLimit:
                plan
                  .limits
                  .campaignConcurrency,

              dailyRecipientsUsedBefore,

              dailyRecipientsUsedAfter,

              dailyRecipientsLimit:
                plan
                  .limits
                  .dailyRecipients,
            },
            "Communication campaign plan usage reserved"
          );

          return {
            campaignId,

            tier:
              input.tier,

            plan,

            usageDate,

            reservationCreated,

            reservationReactivated,

            activeCampaignsBefore,

            activeCampaignsAfter,

            concurrencyLimit:
              plan
                .limits
                .campaignConcurrency,

            dailyRecipientsUsedBefore,

            dailyRecipientsUsedAfter,

            dailyRecipientsLimit:
              plan
                .limits
                .dailyRecipients,
          };
        },
        {
          isolationLevel:
            Prisma
              .TransactionIsolationLevel
              .Serializable,
        }
      );
  } catch (
    error
  ) {
    if (
      isCommunicationUsageLimitError(
        error
      )
    ) {
      throw error;
    }

    log.error(
      {
        event:
          "communication.usage.launch_reservation_failed",

        campaignId,

        tier:
          input.tier,

        usageDate:
          usageDate
            .toISOString(),

        error:
          normalizeError(
            error
          ),
      },
      "Communication campaign usage reservation failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Queue Failure Compensation
//
// Status rollback and quota release are committed in
// one database transaction. The reservation is never
// released unless this request still owns the expected
// pre-execution campaign status.
//--------------------------------------------------

export async function compensateCommunicationCampaignQueueFailure(
  input: {
    campaignId:
      string;

    usageDate:
      Date;

    expectedStatus:
      CommunicationCampaignStatus;
  }
): Promise<{
  campaignMarkedFailed:
    boolean;

  reservationReleased:
    boolean;
}> {
  const campaignId =
    input
      .campaignId
      .trim();

  if (
    !campaignId
  ) {
    return {
      campaignMarkedFailed:
        false,

      reservationReleased:
        false,
    };
  }

  const usageDate =
    normalizeCommunicationUsageDate(
      input.usageDate
    );

  const result =
    await prisma
      .$transaction(
        async transaction => {
          const failed =
            await transaction
              .communicationCampaign
              .updateMany({
                where: {
                  id:
                    campaignId,

                  status:
                    input
                      .expectedStatus,
                },

                data: {
                  status:
                    CommunicationCampaignStatus.FAILED,
                },
              });

          //------------------------------------------------
          // If status already moved, execution may have
          // been accepted elsewhere. Never release quota.
          //------------------------------------------------

          if (
            failed.count ===
            0
          ) {
            return {
              campaignMarkedFailed:
                false,

              reservationReleased:
                false,
            };
          }

          const released =
            await transaction
              .communicationCampaignUsage
              .updateMany({
                where: {
                  campaignId,

                  usageDate,

                  releasedAt:
                    null,
                },

                data: {
                  releasedAt:
                    new Date(),
                },
              });

          return {
            campaignMarkedFailed:
              true,

            reservationReleased:
              released.count >
              0,
          };
        }
      );

  log.warn(
    {
      event:
        "communication.usage.queue_failure_compensated",

      campaignId,

      usageDate:
        usageDate
          .toISOString(),

      expectedStatus:
        input
          .expectedStatus,

      campaignMarkedFailed:
        result
          .campaignMarkedFailed,

      reservationReleased:
        result
          .reservationReleased,
    },
    "Communication campaign queue failure compensation completed"
  );

  return result;
}

//--------------------------------------------------
// Release Reservation
//
// Standalone administrative/helper release. Normal
// queue-failure handling should use the atomic
// compensation function above.
//--------------------------------------------------

export async function releaseCommunicationCampaignUsageReservation(
  campaignId:
    string,

  usageDate:
    Date
): Promise<boolean> {
  const normalizedCampaignId =
    campaignId
      .trim();

  if (
    !normalizedCampaignId
  ) {
    return false;
  }

  const normalizedUsageDate =
    normalizeCommunicationUsageDate(
      usageDate
    );

  const released =
    await prisma
      .communicationCampaignUsage
      .updateMany({
        where: {
          campaignId:
            normalizedCampaignId,

          usageDate:
            normalizedUsageDate,

          releasedAt:
            null,
        },

        data: {
          releasedAt:
            new Date(),
        },
      });

  if (
    released.count >
    0
  ) {
    log.info(
      {
        event:
          "communication.usage.reservation_released",

        campaignId:
          normalizedCampaignId,

        usageDate:
          normalizedUsageDate
            .toISOString(),
      },
      "Communication campaign usage reservation released"
    );
  }

  return (
    released.count >
    0
  );
}

//--------------------------------------------------
// Usage Date Label
//--------------------------------------------------

function formatUsageDate(
  value:
    Date
): string {
  return value
    .toISOString()
    .slice(
      0,
      10
    );
}