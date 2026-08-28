import {
  CallStatus,
  Prisma,
} from "@prisma/client";

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  createLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  mapProviderStatus,
} from "@/providers/telephony/status-map";

import {
  getCallRetryDecision,
} from "@/services/calls/call-retry-policy";

import {
  CallRetryQueueService,
} from "@/services/calls/call-retry-queue.service";

import {
  finalizeCampaignRunIfReady,
} from "@/services/campaigns/campaign-finalizer.service";

//--------------------------------------------------
// Service Logger
//--------------------------------------------------

const serviceLog =
  createLogger({
    component:
      "call-service",
  });

//--------------------------------------------------
// Create Call Data
//--------------------------------------------------

export interface CreateCallData {
  provider?: string;

  campaignId: string;

  campaignRunId?: string;

  contactId: string;

  contactPhoneSnapshot: string;

  providerDestination: string;

  usedDevelopmentOverride: boolean;

  destinationOverrideSource?: string;

  language: string;

  attemptNumber?: number;

  maxAttempts?: number;

  retryOfCallId?: string;

  retryReason?: string;

  nextRetryAt?: Date;
}

//--------------------------------------------------
// Create Call Result
//--------------------------------------------------

export interface CreateCallResult {
  call: Awaited<
    ReturnType<
      typeof prisma.call.create
    >
  >;

  created: boolean;
}

//--------------------------------------------------
// Update Status Result
//--------------------------------------------------

export interface UpdateCallStatusResult {
  count: number;

  callId?: string;

  status?: CallStatus;

  previousStatus?: CallStatus;

  duplicate?: boolean;

  ignored?: boolean;

  terminalTransition?: boolean;

  retryScheduled?: boolean;
}

//--------------------------------------------------
// Create Idempotent Internal Call
//--------------------------------------------------

export async function createCall(
  data: CreateCallData
): Promise<CreateCallResult> {
  const startedAt =
    process.hrtime.bigint();

  const attemptNumber =
    data.attemptNumber ??
    1;

  const maxAttempts =
    data.maxAttempts ??
    3;

  const log =
    createLogger({
      component:
        "call-service",

      campaignId:
        data.campaignId,

      campaignRunId:
        data.campaignRunId,

      contactId:
        data.contactId,

      attemptNumber,

      maxAttempts,

      retryOfCallId:
        data.retryOfCallId,
    });

  log.info(
    {
      event:
        "call.create.started",

      usedDevelopmentOverride:
        data.usedDevelopmentOverride,

      destinationOverrideSource:
        data.destinationOverrideSource,
    },
    "Internal call creation started"
  );

  if (
    !Number.isInteger(
      attemptNumber
    ) ||
    attemptNumber <
      1
  ) {
    throw new Error(
      "Call attempt number must be a positive integer"
    );
  }

  if (
    !Number.isInteger(
      maxAttempts
    ) ||
    maxAttempts <
      1
  ) {
    throw new Error(
      "Maximum call attempts must be a positive integer"
    );
  }

  if (
    attemptNumber >
    maxAttempts
  ) {
    throw new Error(
      "Call attempt number cannot exceed maximum attempts"
    );
  }

  try {
    const call =
      await prisma.call.create({
        data: {
          provider:
            data.provider
              ?.trim()
              .toUpperCase() ||
            "TWILIO",

          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,

          contactId:
            data.contactId,

          attemptNumber,

          maxAttempts,

          retryOfCallId:
            data.retryOfCallId,

          retryReason:
            data.retryReason,

          nextRetryAt:
            data.nextRetryAt,

          contactPhoneSnapshot:
            data.contactPhoneSnapshot,

          providerDestination:
            data.providerDestination,

          usedDevelopmentOverride:
            data.usedDevelopmentOverride,

          destinationOverrideSource:
            data.destinationOverrideSource,

          language:
            data.language,

          status:
            CallStatus.QUEUED,
        },
      });

    void EventPublisher.publish(
      AppEvent.CALL_CREATED,
      {
        callId:
          call.id,

        campaignId:
          call.campaignId,

        contactId:
          call.contactId,

        actorType:
          "SYSTEM",

        timestamp:
          Date.now(),
      }
    );

    createCallLogger(
      call.id,
      {
        campaignId:
          call.campaignId,

        campaignRunId:
          call.campaignRunId,

        contactId:
          call.contactId,

        attemptNumber:
          call.attemptNumber,

        maxAttempts:
          call.maxAttempts,
      }
    ).info(
      {
        event:
          "call.create.completed",

        status:
          call.status,

        created:
          true,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Internal call created"
    );

    return {
      call,

      created:
        true,
    };
  } catch (
    error
  ) {
    //----------------------------------------
    // Campaign Contact Attempt Idempotency
    //----------------------------------------

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002" &&
      data.campaignRunId
    ) {
      const existingCall =
        await prisma.call.findFirst({
          where: {
            campaignRunId:
              data.campaignRunId,

            contactId:
              data.contactId,

            attemptNumber,
          },
        });

      if (
        existingCall
      ) {
        createCallLogger(
          existingCall.id,
          {
            campaignId:
              existingCall.campaignId,

            campaignRunId:
              existingCall.campaignRunId,

            contactId:
              existingCall.contactId,

            attemptNumber:
              existingCall.attemptNumber,
          }
        ).warn(
          {
            event:
              "call.create.idempotent_existing",

            created:
              false,

            status:
              existingCall.status,

            durationMs:
              getDurationMs(
                startedAt
              ),
          },
          "Existing call returned for duplicate creation request"
        );

        return {
          call:
            existingCall,

          created:
            false,
        };
      }
    }

    log.error(
      {
        event:
          "call.create.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Internal call creation failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Update Call
//--------------------------------------------------

export async function updateCall(
  id: string,
  data: {
    providerCallId?: string | null;

    status?: CallStatus;

    duration?: number;

    recordingUrl?: string;

    transcript?: string;

    summary?: string;

    requestedAt?: Date;

    queuedAt?: Date;

    ringingAt?: Date;

    answeredAt?: Date;

    completedAt?: Date;

    failedAt?: Date;

    startedAt?: Date;

    endedAt?: Date;

    nextRetryAt?: Date | null;

    retryReason?: string | null;
  }
) {
  const startedAt =
    process.hrtime.bigint();

  const log =
    createCallLogger(
      id
    );

  log.debug(
    {
      event:
        "call.update.started",

      fields:
        Object.keys(
          data
        ),
    },
    "Call update started"
  );

  try {
    const call =
      await prisma.call.update({
        where: {
          id,
        },

        data,
      });

    log.debug(
      {
        event:
          "call.update.completed",

        status:
          call.status,

        providerCallIdPresent:
          Boolean(
            call.providerCallId
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Call updated"
    );

    return call;
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "call.update.failed",

        fields:
          Object.keys(
            data
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Call update failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Get By Provider Call ID
//--------------------------------------------------

export async function getCallByProviderId(
  providerCallId: string
) {
  return prisma.call.findUnique({
    where: {
      providerCallId,
    },
  });
}

//--------------------------------------------------
// Get Internal Call
//--------------------------------------------------

export async function getCall(
  id: string
) {
  return prisma.call.findUnique({
    where: {
      id,
    },

    include: {
      campaign:
        {
          include: {
            ownerUser: true,
          },
        },

      communicationCampaign: {
        include: {
          ownerUser: true,
        },
      },

      inboundProfile:
        {
          select: {
            knowledgeDocumentIds: true,
            callbackEnabled: true,
          },
        },

      ivrFlowVersion:
        true,

      campaignRun:
        true,

      contact:
        true,

      retryOfCall:
        true,

      retryAttempts:
        true,
    },
  });
}

//--------------------------------------------------
// Terminal Status Check
//--------------------------------------------------

function isTerminalCallStatus(
  status: CallStatus
): boolean {
  return (
    status ===
      CallStatus.COMPLETED ||
    status ===
      CallStatus.FAILED ||
    status ===
      CallStatus.BUSY ||
    status ===
      CallStatus.NO_ANSWER ||
    status ===
      CallStatus.CANCELED
  );
}

//--------------------------------------------------
// Status Lifecycle Priority
//--------------------------------------------------

function getCallStatusPriority(
  status: CallStatus
): number {
  switch (
    status
  ) {
    case CallStatus.QUEUED:
      return 1;

    case CallStatus.RINGING:
      return 2;

    case CallStatus.ANSWERED:
      return 3;

    case CallStatus.COMPLETED:
    case CallStatus.FAILED:
    case CallStatus.BUSY:
    case CallStatus.NO_ANSWER:
    case CallStatus.CANCELED:
      return 4;

    default:
      return 0;
  }
}

//--------------------------------------------------
// Find Call For Provider Callback
//--------------------------------------------------

async function findCallForStatusUpdate(
  data: {
    callId?: string;

    providerCallId: string;
  }
) {
  const callSelect = {
    id:
      true,

    campaignId:
      true,

    campaignRunId:
      true,

    contactId:
      true,

    status:
      true,

    providerCallId:
      true,

    duration:
      true,

    attemptNumber:
      true,

    maxAttempts:
      true,

    retryOfCallId:
      true,

    nextRetryAt:
      true,

    retryReason:
      true,

    queuedAt:
      true,

    ringingAt:
      true,

    answeredAt:
      true,

    completedAt:
      true,

    failedAt:
      true,

    startedAt:
      true,

    endedAt:
      true,
  } satisfies Prisma.CallSelect;

  const internalCallId =
    data.callId
      ?.trim();

  const providerCallId =
    data.providerCallId
      .trim();

  if (
    !providerCallId
  ) {
    return null;
  }

  //----------------------------------------------
  // Resolve Using Internal Call ID
  //----------------------------------------------

  if (
    internalCallId
  ) {
    const callByInternalId =
      await prisma.call.findUnique({
        where: {
          id:
            internalCallId,
        },

        select:
          callSelect,
      });

    if (
      !callByInternalId
    ) {
      /*
       * An explicit internal ID was supplied but
       * did not match any call. Do not silently
       * update another record using only CallSid.
       */
      return null;
    }

    /*
     * For a newly created outbound call, the
     * providerCallId may still be null.
     *
     * Once it has been stored, it must match the
     * signed provider callback.
     */
    if (
      callByInternalId
        .providerCallId &&
      callByInternalId
        .providerCallId !==
        providerCallId
    ) {
      serviceLog.warn(
        {
          event:
            "call.status.callback.provider_mismatch",

          internalCallIdPresent:
            true,

          storedProviderCallIdPresent:
            true,

          incomingProviderCallIdPresent:
            true,
        },
        "Provider callback identifiers did not match"
      );

      return null;
    }

    return callByInternalId;
  }

  //----------------------------------------------
  // Resolve Using Provider Call ID
  //----------------------------------------------

  return prisma.call.findUnique({
    where: {
      providerCallId,
    },

    select:
      callSelect,
  });
}

//--------------------------------------------------
// Handle Verified Provider Status Callback
//--------------------------------------------------

export async function updateCallStatus(
  data: {
    callId?: string;

    providerCallId: string;

    status: string;

    duration?: number;
  }
): Promise<UpdateCallStatusResult> {
  const startedAt =
    process.hrtime.bigint();

  const mappedStatus =
    mapProviderStatus(
      data.status
    );

  const now =
    new Date();

  //----------------------------------------
  // Locate Internal Call
  //----------------------------------------

  const existingCall =
    await findCallForStatusUpdate({
      callId:
        data.callId,

      providerCallId:
        data.providerCallId,
    });

  if (
    !existingCall
  ) {
    serviceLog.warn(
      {
        event:
          "call.status.callback.unmatched",

        internalCallId:
          data.callId,

        providerCallIdPresent:
          Boolean(
            data.providerCallId
          ),

        providerStatus:
          data.status,

        mappedStatus,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Provider status callback did not match an internal call"
    );

    return {
      count:
        0,

      ignored:
        true,

      retryScheduled:
        false,
    };
  }

  const log =
    createCallLogger(
      existingCall.id,
      {
        campaignId:
          existingCall.campaignId,

        campaignRunId:
          existingCall.campaignRunId,

        contactId:
          existingCall.contactId,

        providerCallIdPresent:
          Boolean(
            data.providerCallId
          ),

        attemptNumber:
          existingCall.attemptNumber,

        maxAttempts:
          existingCall.maxAttempts,
      }
    );

  const existingStatus =
    existingCall.status;

  const existingIsTerminal =
    isTerminalCallStatus(
      existingStatus
    );

  const incomingIsTerminal =
    isTerminalCallStatus(
      mappedStatus
    );

  const existingPriority =
    getCallStatusPriority(
      existingStatus
    );

  const incomingPriority =
    getCallStatusPriority(
      mappedStatus
    );

  const duplicateStatus =
    existingStatus ===
    mappedStatus;

  log.info(
    {
      event:
        "call.status.callback.received",

      previousStatus:
        existingStatus,

      incomingStatus:
        mappedStatus,

      providerStatus:
        data.status,

      duplicateStatus,

      providerDuration:
        data.duration,
    },
    "Provider call status callback received"
  );

  //----------------------------------------
  // Protect Final Call Status
  //----------------------------------------

  if (
    existingIsTerminal &&
    !duplicateStatus
  ) {
    log.warn(
      {
        event:
          "call.status.callback.ignored_terminal",

        existingStatus,

        incomingStatus:
          mappedStatus,

        providerStatus:
          data.status,

        retryScheduled:
          Boolean(
            existingCall.nextRetryAt
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Status update ignored because call is already terminal"
    );

    return {
      count:
        1,

      callId:
        existingCall.id,

      status:
        existingStatus,

      previousStatus:
        existingStatus,

      duplicate:
        false,

      ignored:
        true,

      terminalTransition:
        false,

      retryScheduled:
        Boolean(
          existingCall.nextRetryAt
        ),
    };
  }

  //----------------------------------------
  // Prevent Backward Lifecycle Transition
  //----------------------------------------

  if (
    !existingIsTerminal &&
    !incomingIsTerminal &&
    incomingPriority <
      existingPriority
  ) {
    log.warn(
      {
        event:
          "call.status.callback.ignored_out_of_order",

        existingStatus,

        incomingStatus:
          mappedStatus,

        providerStatus:
          data.status,

        existingPriority,

        incomingPriority,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Out-of-order call status callback ignored"
    );

    return {
      count:
        1,

      callId:
        existingCall.id,

      status:
        existingStatus,

      previousStatus:
        existingStatus,

      duplicate:
        false,

      ignored:
        true,

      terminalTransition:
        false,

      retryScheduled:
        false,
    };
  }

  const terminalTransition =
    !existingIsTerminal &&
    incomingIsTerminal;

  //----------------------------------------
  // Build Safe Update
  //----------------------------------------

  const updateData:
    Prisma.CallUpdateInput = {};

  if (
    !existingCall.providerCallId &&
    data.providerCallId
  ) {
    updateData.providerCallId =
      data.providerCallId;
  }

  if (
    !duplicateStatus
  ) {
    updateData.status =
      mappedStatus;
  }

  if (
    data.duration !==
      undefined &&
    Number.isFinite(
      data.duration
    ) &&
    data.duration >= 0 &&
    (
      existingCall.duration ===
        null ||
      existingCall.duration ===
        undefined ||
      existingCall.duration ===
        0
    )
  ) {
    updateData.duration =
      Math.floor(
        data.duration
      );
  }

  //----------------------------------------
  // First Occurrence Timestamps
  //----------------------------------------

  switch (
    mappedStatus
  ) {
    case CallStatus.QUEUED: {
      if (
        !existingCall.queuedAt
      ) {
        updateData.queuedAt =
          now;
      }

      break;
    }

    case CallStatus.RINGING: {
      if (
        !existingCall.ringingAt
      ) {
        updateData.ringingAt =
          now;
      }

      break;
    }

    case CallStatus.ANSWERED: {
      if (
        !existingCall.answeredAt
      ) {
        updateData.answeredAt =
          now;
      }

      if (
        !existingCall.startedAt
      ) {
        updateData.startedAt =
          now;
      }

      break;
    }

    case CallStatus.COMPLETED: {
      if (
        !existingCall.completedAt
      ) {
        updateData.completedAt =
          now;
      }

      if (
        !existingCall.endedAt
      ) {
        updateData.endedAt =
          now;
      }

      updateData.nextRetryAt =
        null;

      updateData.retryReason =
        null;

      if (
        updateData.duration ===
          undefined &&
        (
          existingCall.duration ===
            null ||
          existingCall.duration ===
            undefined ||
          existingCall.duration ===
            0
        ) &&
        existingCall.startedAt
      ) {
        updateData.duration =
          Math.max(
            0,
            Math.floor(
              (
                now.getTime() -
                existingCall
                  .startedAt
                  .getTime()
              ) /
                1000
            )
          );
      }

      break;
    }

    case CallStatus.FAILED:
    case CallStatus.BUSY:
    case CallStatus.NO_ANSWER:
    case CallStatus.CANCELED: {
      if (
        !existingCall.failedAt
      ) {
        updateData.failedAt =
          now;
      }

      if (
        !existingCall.completedAt
      ) {
        updateData.completedAt =
          now;
      }

      if (
        !existingCall.endedAt
      ) {
        updateData.endedAt =
          now;
      }

      break;
    }
  }

  //----------------------------------------
  // Handle Duplicate Callback
  //----------------------------------------

  if (
    Object.keys(
      updateData
    ).length ===
    0
  ) {
    let retryScheduled =
      Boolean(
        existingCall.nextRetryAt
      );

    if (
      existingIsTerminal &&
      duplicateStatus &&
      existingCall.campaignId &&
      existingCall.contactId
    ) {
      retryScheduled =
        await scheduleCallRetryIfEligible({
          callId:
            existingCall.id,

          campaignId:
            existingCall.campaignId,

          campaignRunId:
            existingCall.campaignRunId,

          contactId:
            existingCall.contactId,

          status:
            existingStatus,

          attemptNumber:
            existingCall.attemptNumber,

          maxAttempts:
            existingCall.maxAttempts,

          existingNextRetryAt:
            existingCall.nextRetryAt,
        });
    }

    log.info(
      {
        event:
          "call.status.callback.duplicate",

        status:
          existingStatus,

        retryScheduled,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Duplicate call status callback processed"
    );

    return {
      count:
        1,

      callId:
        existingCall.id,

      status:
        existingStatus,

      previousStatus:
        existingStatus,

      duplicate:
        true,

      ignored:
        true,

      terminalTransition:
        false,

      retryScheduled,
    };
  }

  //----------------------------------------
  // Persist Lifecycle Update
  //----------------------------------------

  const updatedCall =
    await prisma.call.update({
      where: {
        id:
          existingCall.id,
      },

      data:
        updateData,

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

  log.info(
    {
      event:
        "call.status.transition.persisted",

      previousStatus:
        existingStatus,

      currentStatus:
        updatedCall.status,

      terminalTransition,

      durationSeconds:
        updatedCall.duration,
    },
    "Call lifecycle transition persisted"
  );

  //----------------------------------------
  // Schedule Delayed Retry
  //----------------------------------------

  let retryScheduled =
    false;

  if (
    terminalTransition &&
    existingCall.campaignId &&
    existingCall.contactId
  ) {
    retryScheduled =
      await scheduleCallRetryIfEligible({
        callId:
          existingCall.id,

        campaignId:
          existingCall.campaignId,

        campaignRunId:
          existingCall.campaignRunId,

        contactId:
          existingCall.contactId,

        status:
          updatedCall.status,

        attemptNumber:
          existingCall.attemptNumber,

        maxAttempts:
          existingCall.maxAttempts,

        existingNextRetryAt:
          updatedCall.nextRetryAt,
      });
  }

  //----------------------------------------
  // Re-Evaluate Campaign Completion
  //----------------------------------------

  if (
    terminalTransition &&
    existingCall.campaignRunId
  ) {
    const finalizationStartedAt =
      process.hrtime.bigint();

    try {
      const finalization =
        await finalizeCampaignRunIfReady(
          existingCall.campaignRunId
        );

      log.info(
        {
          event:
            "call.status.finalization.checked",

          finalized:
            finalization.finalized,

          skipped:
            finalization.skipped,

          finalizationReason:
            finalization.reason,

          runStatus:
            finalization.runStatus,

          settledContacts:
            finalization.settledContacts,

          unresolvedContacts:
            finalization.unresolvedContacts,

          retryScheduled,

          durationMs:
            getDurationMs(
              finalizationStartedAt
            ),
        },
        "Campaign finalization checked after call status update"
      );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "call.status.finalization.failed",

          status:
            updatedCall.status,

          retryScheduled,

          durationMs:
            getDurationMs(
              finalizationStartedAt
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Campaign finalization check failed after call status update"
      );
    }
  }

  log.info(
    {
      event:
        "call.status.callback.completed",

      previousStatus:
        existingStatus,

      currentStatus:
        updatedCall.status,

      terminalTransition,

      retryScheduled,

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Provider call status callback completed"
  );

  return {
    count:
      1,

    callId:
      updatedCall.id,

    status:
      updatedCall.status,

    previousStatus:
      existingStatus,

    duplicate:
      duplicateStatus,

    ignored:
      false,

    terminalTransition,

    retryScheduled,
  };
}

//--------------------------------------------------
// Schedule Call Retry When Eligible
//--------------------------------------------------

async function scheduleCallRetryIfEligible(
  input: {
    callId: string;

    campaignId: string;

    campaignRunId:
      | string
      | null;

    contactId: string;

    status: CallStatus;

    attemptNumber: number;

    maxAttempts: number;

    existingNextRetryAt:
      | Date
      | null;
  }
): Promise<boolean> {
  const startedAt =
    process.hrtime.bigint();

  const log =
    createCallLogger(
      input.callId,
      {
        campaignId:
          input.campaignId,

        campaignRunId:
          input.campaignRunId,

        contactId:
          input.contactId,

        attemptNumber:
          input.attemptNumber,

        maxAttempts:
          input.maxAttempts,
      }
    );

  //----------------------------------------
  // Campaign Run Is Required
  //----------------------------------------

  if (
    !input.campaignRunId
  ) {
    log.debug(
      {
        event:
          "call.retry.evaluation.skipped",

        reason:
          "standalone_call",

        status:
          input.status,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Automatic retry skipped for standalone call"
    );

    return false;
  }

  //----------------------------------------
  // Evaluate Retry Policy
  //----------------------------------------

  const decision =
    getCallRetryDecision({
      status:
        input.status,

      attemptNumber:
        input.attemptNumber,

      maxAttempts:
        input.maxAttempts,
    });

  if (
    !decision.shouldRetry ||
    !decision.reason
  ) {
    if (
      input.existingNextRetryAt
    ) {
      await prisma.call.update({
        where: {
          id:
            input.callId,
        },

        data: {
          nextRetryAt:
            null,

          retryReason:
            null,
        },
      });
    }

    log.info(
      {
        event:
          "call.retry.not_eligible",

        status:
          input.status,

        attemptNumber:
          input.attemptNumber,

        maxAttempts:
          input.maxAttempts,

        staleRetryMetadataCleared:
          Boolean(
            input.existingNextRetryAt
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Call is not eligible for retry"
    );

    return false;
  }

  const nextAttemptNumber =
    input.attemptNumber +
    1;

  if (
    nextAttemptNumber >
    input.maxAttempts
  ) {
    log.info(
      {
        event:
          "call.retry.maximum_attempts_reached",

        currentAttempt:
          input.attemptNumber,

        nextAttempt:
          nextAttemptNumber,

        maxAttempts:
          input.maxAttempts,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Maximum call attempts reached"
    );

    return false;
  }

  const calculatedRetryAt =
    new Date(
      Date.now() +
        decision.delayMs
    );

  const nextRetryAt =
    input.existingNextRetryAt ??
    calculatedRetryAt;

  //----------------------------------------
  // Persist Retry Schedule
  //----------------------------------------

  await prisma.call.update({
    where: {
      id:
        input.callId,
    },

    data: {
      nextRetryAt,

      retryReason:
        decision.reason,
    },
  });

  //----------------------------------------
  // Enqueue Delayed Retry
  //----------------------------------------

  try {
    const delayMs =
      Math.max(
        nextRetryAt.getTime() -
          Date.now(),
        0
      );

    const job =
      await CallRetryQueueService.enqueue(
        {
          originalCallId:
            input.callId,

          campaignId:
            input.campaignId,

          campaignRunId:
            input.campaignRunId,

          contactId:
            input.contactId,

          attemptNumber:
            nextAttemptNumber,

          maxAttempts:
            input.maxAttempts,

          retryReason:
            decision.reason,
        },
        delayMs
      );

    log.info(
      {
        event:
          "call.retry.scheduled",

        currentAttempt:
          input.attemptNumber,

        nextAttempt:
          nextAttemptNumber,

        status:
          input.status,

        retryReason:
          decision.reason,

        nextRetryAt:
          nextRetryAt.toISOString(),

        delayMs,

        jobId:
          job.id,

        reusedExistingRetryTime:
          Boolean(
            input.existingNextRetryAt
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Call retry scheduled"
    );

    return true;
  } catch (
    error
  ) {
    //----------------------------------------
    // Clear Pending Timestamp After Failure
    //----------------------------------------

    try {
      await prisma.call.update({
        where: {
          id:
            input.callId,
        },

        data: {
          nextRetryAt:
            null,
        },
      });

      log.warn(
        {
          event:
            "call.retry.queue_failure_metadata_cleared",
        },
        "Retry timestamp cleared after queue failure"
      );
    } catch (
      cleanupError
    ) {
      log.error(
        {
          event:
            "call.retry.queue_failure_cleanup_failed",

          error:
            normalizeError(
              cleanupError
            ),
        },
        "Failed to clear retry timestamp after queue failure"
      );
    }

    log.error(
      {
        event:
          "call.retry.schedule_failed",

        currentAttempt:
          input.attemptNumber,

        nextAttempt:
          nextAttemptNumber,

        status:
          input.status,

        retryReason:
          decision.reason,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Failed to schedule call retry"
    );

    return false;
  }
}
