import {
  Job,
  Worker,
} from "bullmq";

import {
  CampaignRunStatus,
  CampaignStatus,
  ContactStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  redisConnection,
} from "@/lib/redis";

import {
  createWorkerLogger,
  getDurationMs,
  maskPhoneNumber,
  normalizeError,
} from "@/lib/logger";

import {
  CALL_RETRY_JOB_NAME,
  CALL_RETRY_QUEUE_NAME,
  CallRetryJobData,
} from "@/services/calls/call-retry-queue.service";

import {
  startCall,
} from "@/services/telephony/telephony.service";

import {
  finalizeCampaignRunIfReady,
} from "@/services/campaigns/campaign-finalizer.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createWorkerLogger(
    "call-retry-worker",
    {
      queue:
        CALL_RETRY_QUEUE_NAME,
    }
  );

//--------------------------------------------------
// Retry Worker Result
//--------------------------------------------------

export interface CallRetryResult {
  originalCallId: string;

  retryCallId?: string;

  campaignId: string;

  campaignRunId: string;

  contactId: string;

  attemptNumber: number;

  success: boolean;

  skipped: boolean;

  reason?: string;
}

//--------------------------------------------------
// Job Timing
//--------------------------------------------------

const jobStartedTimes =
  new Map<
    string,
    bigint
  >();

//--------------------------------------------------
// Worker State
//--------------------------------------------------

let callRetryWorker:
  | Worker<
      CallRetryJobData,
      CallRetryResult
    >
  | null =
    null;

//--------------------------------------------------
// Initialize Retry Worker
//--------------------------------------------------

export function initializeCallRetryWorker():
  Worker<
    CallRetryJobData,
    CallRetryResult
  > {
  if (
    callRetryWorker
  ) {
    log.debug(
      {
        event:
          "call_retry.worker.initialize.skipped",

        reason:
          "already_initialized",
      },
      "Call retry worker is already initialized"
    );

    return callRetryWorker;
  }

  const concurrency =
    getRetryWorkerConcurrency();

  callRetryWorker =
    new Worker<
      CallRetryJobData,
      CallRetryResult
    >(
      CALL_RETRY_QUEUE_NAME,

      async (
        job:
          Job<
            CallRetryJobData,
            CallRetryResult
          >
      ): Promise<CallRetryResult> => {
        const startedAt =
          process.hrtime.bigint();

        if (
          job.id
        ) {
          jobStartedTimes.set(
            String(
              job.id
            ),
            startedAt
          );
        }

        const jobLog =
          createWorkerLogger(
            "call-retry-worker",
            {
              queue:
                CALL_RETRY_QUEUE_NAME,

              jobId:
                job.id,

              jobName:
                job.name,

              originalCallId:
                job.data.originalCallId,

              campaignId:
                job.data.campaignId,

              campaignRunId:
                job.data.campaignRunId,

              contactId:
                job.data.contactId,

              attemptNumber:
                job.data.attemptNumber,

              maxAttempts:
                job.data.maxAttempts,

              bullAttempt:
                job.attemptsMade +
                1,
            }
          );

        jobLog.info(
          {
            event:
              "call_retry.job.processing.started",
          },
          "Call retry job processing started"
        );

        if (
          job.name !==
          CALL_RETRY_JOB_NAME
        ) {
          throw new Error(
            `Unsupported call retry job: ${job.name}`
          );
        }

        try {
          const result =
            await processCallRetry(
              job
            );

          jobLog.info(
            {
              event:
                "call_retry.job.processing.completed",

              durationMs:
                getDurationMs(
                  startedAt
                ),

              retryCallId:
                result.retryCallId,

              success:
                result.success,

              skipped:
                result.skipped,

              reason:
                result.reason,
            },
            "Call retry job processing completed"
          );

          return result;
        } catch (
          error
        ) {
          jobLog.error(
            {
              event:
                "call_retry.job.processing.failed",

              durationMs:
                getDurationMs(
                  startedAt
                ),

              error:
                normalizeError(
                  error
                ),
            },
            "Call retry job processing failed"
          );

          throw error;
        }
      },

      {
        connection:
          redisConnection,

        concurrency,
      }
    );

  //------------------------------------------------
  // Worker Events
  //------------------------------------------------

  callRetryWorker.on(
    "ready",
    () => {
      log.info(
        {
          event:
            "call_retry.worker.ready",

          concurrency,
        },
        "Call retry worker is ready"
      );
    }
  );

  callRetryWorker.on(
    "active",
    job => {
      const jobId =
        String(
          job.id ??
          ""
        );

      if (
        jobId &&
        !jobStartedTimes.has(
          jobId
        )
      ) {
        jobStartedTimes.set(
          jobId,
          process.hrtime.bigint()
        );
      }

      log.info(
        {
          event:
            "call_retry.job.active",

          jobId:
            job.id,

          originalCallId:
            job.data.originalCallId,

          campaignId:
            job.data.campaignId,

          campaignRunId:
            job.data.campaignRunId,

          contactId:
            job.data.contactId,

          attemptNumber:
            job.data.attemptNumber,

          bullAttempt:
            job.attemptsMade +
            1,
        },
        "Call retry job became active"
      );
    }
  );

  callRetryWorker.on(
    "completed",
    (
      job,
      result
    ) => {
      const jobId =
        String(
          job.id ??
          ""
        );

      const startedAt =
        jobId
          ? jobStartedTimes.get(
              jobId
            )
          : undefined;

      if (
        jobId
      ) {
        jobStartedTimes.delete(
          jobId
        );
      }

      log.info(
        {
          event:
            "call_retry.job.completed",

          jobId:
            job.id,

          originalCallId:
            result.originalCallId,

          retryCallId:
            result.retryCallId,

          campaignId:
            result.campaignId,

          campaignRunId:
            result.campaignRunId,

          contactId:
            result.contactId,

          attemptNumber:
            result.attemptNumber,

          success:
            result.success,

          skipped:
            result.skipped,

          reason:
            result.reason,

          durationMs:
            startedAt
              ? getDurationMs(
                  startedAt
                )
              : undefined,
        },
        "Call retry job completed"
      );
    }
  );

  callRetryWorker.on(
    "failed",
    (
      job,
      error
    ) => {
      const jobId =
        String(
          job?.id ??
          ""
        );

      const startedAt =
        jobId
          ? jobStartedTimes.get(
              jobId
            )
          : undefined;

      if (
        jobId
      ) {
        jobStartedTimes.delete(
          jobId
        );
      }

      log.error(
        {
          event:
            "call_retry.job.failed",

          jobId:
            job?.id,

          originalCallId:
            job?.data.originalCallId,

          campaignId:
            job?.data.campaignId,

          campaignRunId:
            job?.data.campaignRunId,

          contactId:
            job?.data.contactId,

          attemptNumber:
            job?.data.attemptNumber,

          attemptsMade:
            job?.attemptsMade,

          durationMs:
            startedAt
              ? getDurationMs(
                  startedAt
                )
              : undefined,

          error:
            normalizeError(
              error
            ),
        },
        "Call retry job failed"
      );
    }
  );

  callRetryWorker.on(
    "error",
    error => {
      log.error(
        {
          event:
            "call_retry.worker.error",

          error:
            normalizeError(
              error
            ),
        },
        "Call retry worker error"
      );
    }
  );

  log.info(
    {
      event:
        "call_retry.worker.initialized",

      concurrency,
    },
    "Call retry worker initialized"
  );

  return callRetryWorker;
}

//--------------------------------------------------
// Process Retry
//--------------------------------------------------

async function processCallRetry(
  job:
    Job<
      CallRetryJobData,
      CallRetryResult
    >
): Promise<CallRetryResult> {
  const {
    originalCallId,
    campaignId,
    campaignRunId,
    contactId,
    attemptNumber,
    maxAttempts,
    retryReason,
  } =
    job.data;

  const retryLog =
    createWorkerLogger(
      "call-retry-worker",
      {
        jobId:
          job.id,

        originalCallId,

        campaignId,

        campaignRunId,

        contactId,

        attemptNumber,

        maxAttempts,
      }
    );

  //------------------------------------------------
  // Validate Attempt Number
  //------------------------------------------------

  if (
    attemptNumber >
    maxAttempts
  ) {
    return completeSkippedRetry(
      job.data,
      "Maximum retry attempts reached"
    );
  }

  if (
    attemptNumber <
    2
  ) {
    return completeSkippedRetry(
      job.data,
      "Retry attempt number must be at least 2"
    );
  }

  //------------------------------------------------
  // Load Original Call And Related Data
  //------------------------------------------------

  const originalCall =
    await prisma.call.findUnique({
      where: {
        id:
          originalCallId,
      },

      include: {
        contact:
          true,

        campaign:
          true,

        campaignRun:
          true,
      },
    });

  if (
    !originalCall
  ) {
    return completeSkippedRetry(
      job.data,
      "Original call no longer exists"
    );
  }

  //------------------------------------------------
  // Verify Job Ownership
  //------------------------------------------------

  if (
    originalCall.campaignId !==
      campaignId ||
    originalCall.contactId !==
      contactId ||
    originalCall.campaignRunId !==
      campaignRunId
  ) {
    return completeSkippedRetry(
      job.data,
      "Retry job does not match the original call"
    );
  }

  //------------------------------------------------
  // Validate Campaign Run
  //------------------------------------------------

  if (
    !originalCall.campaignRun
  ) {
    return completeSkippedRetry(
      job.data,
      "Campaign run no longer exists"
    );
  }

  if (
    originalCall
      .campaignRun
      .status ===
    CampaignRunStatus.CANCELLED
  ) {
    return completeSkippedRetry(
      job.data,
      "Campaign run was cancelled"
    );
  }

  //------------------------------------------------
  // Validate Campaign
  //------------------------------------------------

  if (
    originalCall
      .campaign
      .status ===
    CampaignStatus.CANCELLED
  ) {
    return completeSkippedRetry(
      job.data,
      "Campaign was cancelled"
    );
  }

  //------------------------------------------------
  // Validate Contact
  //------------------------------------------------

  if (
    originalCall
      .contact
      .status ===
    ContactStatus.BLOCKED
  ) {
    return completeSkippedRetry(
      job.data,
      "Contact is blocked"
    );
  }

  const contactPhone =
    originalCall
      .contactPhoneSnapshot
      ?.trim() ||
    originalCall
      .contact
      .phone
      ?.trim();

  if (
    !contactPhone
  ) {
    return completeSkippedRetry(
      job.data,
      "Contact phone number is missing"
    );
  }

  //------------------------------------------------
  // Resolve Provider Destination
  //------------------------------------------------

  const providerDestination =
    resolveRetryDestination({
      originalDestination:
        originalCall
          .providerDestination,

      contactPhone,

      usedDevelopmentOverride:
        originalCall
          .usedDevelopmentOverride,
    });

  if (
    !providerDestination
  ) {
    return completeSkippedRetry(
      job.data,
      "Retry destination could not be resolved"
    );
  }

  //------------------------------------------------
  // Prevent Duplicate Retry Attempt
  //------------------------------------------------

  const existingAttempt =
    await prisma.call.findFirst({
      where: {
        campaignRunId,

        contactId,

        attemptNumber,
      },

      select: {
        id:
          true,

        providerCallId:
          true,

        status:
          true,
      },
    });

  if (
    existingAttempt
  ) {
    await prisma.call.updateMany({
      where: {
        id:
          originalCallId,
      },

      data: {
        nextRetryAt:
          null,
      },
    });

    try {
      await finalizeCampaignRunIfReady(
        campaignRunId
      );
    } catch (
      error
    ) {
      retryLog.error(
        {
          event:
            "call_retry.existing_attempt.finalization_failed",

          existingRetryCallId:
            existingAttempt.id,

          error:
            normalizeError(
              error
            ),
        },
        "Campaign finalization failed for existing retry attempt"
      );
    }

    retryLog.warn(
      {
        event:
          "call_retry.attempt.already_exists",

        existingRetryCallId:
          existingAttempt.id,

        existingProviderCallId:
          existingAttempt.providerCallId,

        existingStatus:
          existingAttempt.status,
      },
      "Retry attempt already exists"
    );

    return {
      originalCallId,

      retryCallId:
        existingAttempt.id,

      campaignId,

      campaignRunId,

      contactId,

      attemptNumber,

      success:
        true,

      skipped:
        true,

      reason:
        "Retry attempt already exists",
    };
  }

  //------------------------------------------------
  // Read Provider Source Number
  //------------------------------------------------

  const providerPhoneNumber =
    getRequiredEnvironmentVariable(
      "TWILIO_PHONE_NUMBER"
    );

  //------------------------------------------------
  // Place Retry Call
  //------------------------------------------------

  const dispatchStartedAt =
    process.hrtime.bigint();

  retryLog.info(
    {
      event:
        "call_retry.dispatch.started",

      contactPhone:
        maskPhoneNumber(
          contactPhone
        ),

      providerDestination:
        maskPhoneNumber(
          providerDestination
        ),

      retryReason,

      usedDevelopmentOverride:
        originalCall
          .usedDevelopmentOverride,
    },
    "Retry call dispatch started"
  );

  const result =
    await startCall({
      campaignId,

      campaignRunId,

      contactId,

      contactPhone,

      to:
        providerDestination,

      from:
        providerPhoneNumber,

      language:
        originalCall.language,

      script:
        originalCall
          .campaign
          .description
          ?.trim() ||
        "Hello from the AI IVR management system.",

      usedDevelopmentOverride:
        originalCall
          .usedDevelopmentOverride,

      destinationOverrideSource:
        originalCall
          .destinationOverrideSource ??
        undefined,

      attemptNumber,

      maxAttempts,

      retryOfCallId:
        originalCall.id,

      retryReason,
    });

  retryLog.info(
    {
      event:
        "call_retry.dispatch.completed",

      retryCallId:
        result.callId,

      providerCallId:
        result.providerCallId,

      duplicate:
        result.duplicate,

      durationMs:
        getDurationMs(
          dispatchStartedAt
        ),
    },
    "Retry call dispatched"
  );

  //------------------------------------------------
  // Clear Original Retry Schedule
  //------------------------------------------------

  await prisma.call.update({
    where: {
      id:
        originalCall.id,
    },

    data: {
      nextRetryAt:
        null,
    },
  });

  /*
   * The original pending retry is replaced by the
   * new queued call attempt. The finalizer should
   * therefore keep the run active.
   */
  try {
    await finalizeCampaignRunIfReady(
      campaignRunId
    );
  } catch (
    error
  ) {
    retryLog.error(
      {
        event:
          "call_retry.dispatch.finalization_failed",

        retryCallId:
          result.callId,

        error:
          normalizeError(
            error
          ),
      },
      "Campaign finalization failed after retry dispatch"
    );
  }

  return {
    originalCallId,

    retryCallId:
      result.callId,

    campaignId,

    campaignRunId,

    contactId,

    attemptNumber,

    success:
      true,

    skipped:
      false,
  };
}

//--------------------------------------------------
// Resolve Retry Destination
//--------------------------------------------------

function resolveRetryDestination(
  input: {
    originalDestination:
      | string
      | null;

    contactPhone: string;

    usedDevelopmentOverride:
      boolean;
  }
): string {
  /*
   * In development, prefer the current configured
   * test number instead of an old database snapshot.
   */
  if (
    input
      .usedDevelopmentOverride
  ) {
    const testDestination =
      process.env
        .TEST_DESTINATION_NUMBER
        ?.trim();

    if (
      testDestination
    ) {
      return testDestination;
    }
  }

  return (
    input
      .originalDestination
      ?.trim() ||
    input.contactPhone
  );
}

//--------------------------------------------------
// Complete Skipped Retry
//--------------------------------------------------

async function completeSkippedRetry(
  data: CallRetryJobData,
  reason: string
): Promise<CallRetryResult> {
  const skipLog =
    createWorkerLogger(
      "call-retry-worker",
      {
        originalCallId:
          data.originalCallId,

        campaignId:
          data.campaignId,

        campaignRunId:
          data.campaignRunId,

        contactId:
          data.contactId,

        attemptNumber:
          data.attemptNumber,

        maxAttempts:
          data.maxAttempts,
      }
    );

  skipLog.warn(
    {
      event:
        "call_retry.skipped",

      reason,
    },
    "Call retry skipped"
  );

  //------------------------------------------------
  // Clear Pending Retry Metadata
  //------------------------------------------------

  try {
    const result =
      await prisma.call.updateMany({
        where: {
          id:
            data.originalCallId,
        },

        data: {
          nextRetryAt:
            null,

          retryReason:
            reason,
        },
      });

    skipLog.info(
      {
        event:
          "call_retry.skipped.metadata_cleared",

        updatedCount:
          result.count,

        reason,
      },
      "Skipped retry metadata cleared"
    );
  } catch (
    error
  ) {
    skipLog.error(
      {
        event:
          "call_retry.skipped.metadata_clear_failed",

        reason,

        error:
          normalizeError(
            error
          ),
      },
      "Failed to clear skipped retry metadata"
    );
  }

  //------------------------------------------------
  // Re-Evaluate Campaign Finalization
  //------------------------------------------------

  try {
    const finalization =
      await finalizeCampaignRunIfReady(
        data.campaignRunId
      );

    skipLog.info(
      {
        event:
          "call_retry.skipped.finalization_checked",

        finalized:
          finalization.finalized,

        skipped:
          finalization.skipped,

        runStatus:
          finalization.runStatus,

        finalizationReason:
          finalization.reason,
      },
      "Campaign finalization checked after skipped retry"
    );
  } catch (
    error
  ) {
    skipLog.error(
      {
        event:
          "call_retry.skipped.finalization_failed",

        reason,

        error:
          normalizeError(
            error
          ),
      },
      "Campaign finalization failed after skipped retry"
    );
  }

  return {
    originalCallId:
      data.originalCallId,

    campaignId:
      data.campaignId,

    campaignRunId:
      data.campaignRunId,

    contactId:
      data.contactId,

    attemptNumber:
      data.attemptNumber,

    success:
      false,

    skipped:
      true,

    reason,
  };
}

//--------------------------------------------------
// Worker Concurrency
//--------------------------------------------------

function getRetryWorkerConcurrency():
  number {
  const rawValue =
    process.env
      .CALL_RETRY_CONCURRENCY
      ?.trim();

  const parsedValue =
    rawValue
      ? Number(
          rawValue
        )
      : 2;

  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue <
      1
  ) {
    log.warn(
      {
        event:
          "call_retry.worker.invalid_concurrency",

        configuredValue:
          rawValue,

        fallbackValue:
          2,
      },
      "Invalid CALL_RETRY_CONCURRENCY; using default"
    );

    return 2;
  }

  return Math.min(
    parsedValue,
    10
  );
}

//--------------------------------------------------
// Required Environment Variable
//--------------------------------------------------

function getRequiredEnvironmentVariable(
  name: string
): string {
  const value =
    process.env[
      name
    ]
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      `${name} is not configured`
    );
  }

  return value;
}

//--------------------------------------------------
// Existing Worker
//--------------------------------------------------

export function getCallRetryWorker():
  | Worker<
      CallRetryJobData,
      CallRetryResult
    >
  | null {
  return callRetryWorker;
}

//--------------------------------------------------
// Close Worker
//--------------------------------------------------

export async function closeCallRetryWorker():
  Promise<void> {
  if (
    !callRetryWorker
  ) {
    log.debug(
      {
        event:
          "call_retry.worker.close.skipped",

        reason:
          "not_initialized",
      },
      "Call retry worker is not initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "call_retry.worker.close.started",
    },
    "Call retry worker shutdown started"
  );

  await callRetryWorker.close();

  callRetryWorker =
    null;

  jobStartedTimes.clear();

  log.info(
    {
      event:
        "call_retry.worker.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Call retry worker closed"
  );
}