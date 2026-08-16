import {
  redisConnection,
} from "@/lib/redis";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Transfer Status
//--------------------------------------------------

export type HumanTransferStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "DIALING"
  | "ANSWERED"
  | "FAILED"
  | "CANCELLED"
  | "COMPLETED";

//--------------------------------------------------
// State
//--------------------------------------------------

export interface HumanTransferLifecycleState {
  callId:
    string;

  status:
    HumanTransferStatus;

  provider?:
    string;

  destination?:
    string;

  childProviderCallId?:
    string;

  lastSequenceNumber?:
    number;

  failureCode?:
    string;

  failureMessage?:
    string;

  requestedAt:
    string;

  updatedAt:
    string;

  answeredAt?:
    string;

  completedAt?:
    string;
}

//--------------------------------------------------
// Provider Event Input
//--------------------------------------------------

export interface HumanTransferProviderEventInput {
  callId:
    string;

  provider:
    string;

  childProviderCallId:
    string;

  status:
    Extract<
      HumanTransferStatus,
      | "DIALING"
      | "ANSWERED"
      | "FAILED"
      | "COMPLETED"
    >;

  sequenceNumber?:
    number;

  failureCode?:
    string;

  failureMessage?:
    string;
}

//--------------------------------------------------
// Provider Event Result
//--------------------------------------------------

export interface HumanTransferProviderEventResult {
  applied:
    boolean;

  reason?:
    | "STATE_NOT_FOUND"
    | "CHILD_CALL_MISMATCH"
    | "STALE_SEQUENCE"
    | "INVALID_TRANSITION";

  state:
    HumanTransferLifecycleState | null;
}

//--------------------------------------------------
// Constants
//--------------------------------------------------

const DEFAULT_TTL_SECONDS =
  60 *
  60 *
  6;

const ACTIVE_STATUSES:
  HumanTransferStatus[] =
[
  "REQUESTED",
  "ACCEPTED",
  "DIALING",
  "ANSWERED",
];

//--------------------------------------------------
// Request Transfer
//--------------------------------------------------

export async function markHumanTransferRequested(
  callId:
    string
): Promise<HumanTransferLifecycleState> {
  const now =
    new Date()
      .toISOString();

  const state:
    HumanTransferLifecycleState =
    {
      callId,

      status:
        "REQUESTED",

      requestedAt:
        now,

      updatedAt:
        now,
    };

  await saveHumanTransferState(
    state
  );

  return state;
}

//--------------------------------------------------
// Accepted
//--------------------------------------------------

export async function markHumanTransferAccepted(
  callId:
    string,

  input?: {
    provider?:
      string;

    destination?:
      string;
  }
): Promise<HumanTransferLifecycleState> {
  return updateHumanTransferState(
    callId,
    "ACCEPTED",
    input
  );
}

//--------------------------------------------------
// Dialing
//--------------------------------------------------

export async function markHumanTransferDialing(
  callId:
    string
): Promise<HumanTransferLifecycleState> {
  return updateHumanTransferState(
    callId,
    "DIALING"
  );
}

//--------------------------------------------------
// Answered
//--------------------------------------------------

export async function markHumanTransferAnswered(
  callId:
    string
): Promise<HumanTransferLifecycleState> {
  const state =
    await updateHumanTransferState(
      callId,
      "ANSWERED"
    );

  const updated:
    HumanTransferLifecycleState =
    {
      ...state,

      answeredAt:
        state.answeredAt ??
        new Date()
          .toISOString(),
    };

  await saveHumanTransferState(
    updated
  );

  return updated;
}

//--------------------------------------------------
// Failed
//--------------------------------------------------

export async function markHumanTransferFailed(
  callId:
    string,

  input?: {
    failureCode?:
      string;

    failureMessage?:
      string;
  }
): Promise<HumanTransferLifecycleState> {
  return updateHumanTransferState(
    callId,
    "FAILED",
    {
      failureCode:
        input
          ?.failureCode,

      failureMessage:
        input
          ?.failureMessage,
    }
  );
}

//--------------------------------------------------
// Cancelled
//--------------------------------------------------

export async function markHumanTransferCancelled(
  callId:
    string
): Promise<HumanTransferLifecycleState> {
  return updateHumanTransferState(
    callId,
    "CANCELLED"
  );
}

//--------------------------------------------------
// Completed
//--------------------------------------------------

export async function markHumanTransferCompleted(
  callId:
    string
): Promise<HumanTransferLifecycleState> {
  const state =
    await updateHumanTransferState(
      callId,
      "COMPLETED"
    );

  const updated:
    HumanTransferLifecycleState =
    {
      ...state,

      completedAt:
        state.completedAt ??
        new Date()
          .toISOString(),
    };

  await saveHumanTransferState(
    updated
  );

  return updated;
}

//--------------------------------------------------
// Get
//--------------------------------------------------

export async function getHumanTransferState(
  callId:
    string
): Promise<HumanTransferLifecycleState | null> {
  try {
    const raw =
      await redisConnection.get(
        buildKey(
          callId
        )
      );

    if (
      !raw
    ) {
      return null;
    }

    const state =
      JSON.parse(
        raw
      ) as HumanTransferLifecycleState;

    if (
      !state ||
      state.callId !==
        callId
    ) {
      await clearHumanTransferState(
        callId
      );

      return null;
    }

    return state;
  } catch (
    error
  ) {
    const log =
      createCallLogger(
        callId
      );

    log.error(
      {
        event:
          "human_transfer.lifecycle.read_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Human-transfer lifecycle state could not be read"
    );

    return null;
  }
}

//--------------------------------------------------
// Is Active
//--------------------------------------------------

export async function isHumanTransferInProgress(
  callId:
    string
): Promise<boolean> {
  const state =
    await getHumanTransferState(
      callId
    );

  if (
    !state
  ) {
    return false;
  }

  return ACTIVE_STATUSES.includes(
    state.status
  );
}

//--------------------------------------------------
// Should Preserve Call On Media Stop
//--------------------------------------------------

export async function shouldPreserveCallAfterMediaStop(
  callId:
    string
): Promise<boolean> {
  const state =
    await getHumanTransferState(
      callId
    );

  if (
    !state
  ) {
    return false;
  }

  switch (
    state.status
  ) {
    case "REQUESTED":
    case "ACCEPTED":
    case "DIALING":
    case "ANSWERED":
      return true;

    default:
      return false;
  }
}

//--------------------------------------------------
// Apply Provider Child-Leg Event
//--------------------------------------------------

export async function applyHumanTransferProviderEvent(
  input:
    HumanTransferProviderEventInput
): Promise<HumanTransferProviderEventResult> {
  const current =
    await getHumanTransferState(
      input.callId
    );

  //------------------------------------------------
  // State Must Exist
  //------------------------------------------------

  if (
    !current
  ) {
    return {
      applied:
        false,

      reason:
        "STATE_NOT_FOUND",

      state:
        null,
    };
  }

  //------------------------------------------------
  // Child Call Correlation
  //------------------------------------------------

  if (
    current.childProviderCallId &&
    current.childProviderCallId !==
      input.childProviderCallId
  ) {
    return {
      applied:
        false,

      reason:
        "CHILD_CALL_MISMATCH",

      state:
        current,
    };
  }

  //------------------------------------------------
  // Stale / Duplicate Sequence Protection
  //------------------------------------------------

  if (
    input.sequenceNumber !==
      undefined &&
    current.lastSequenceNumber !==
      undefined &&
    input.sequenceNumber <=
      current.lastSequenceNumber
  ) {
    return {
      applied:
        false,

      reason:
        "STALE_SEQUENCE",

      state:
        current,
    };
  }

  //------------------------------------------------
  // Lifecycle Transition Protection
  //------------------------------------------------

  if (
    !isHumanTransferTransitionAllowed(
      current.status,
      input.status
    )
  ) {
    return {
      applied:
        false,

      reason:
        "INVALID_TRANSITION",

      state:
        current,
    };
  }

  const now =
    new Date()
      .toISOString();

  //------------------------------------------------
  // Build Next State
  //------------------------------------------------

  const next:
    HumanTransferLifecycleState =
    {
      ...current,

      provider:
        input.provider,

      childProviderCallId:
        input.childProviderCallId,

      lastSequenceNumber:
        input.sequenceNumber ??
        current.lastSequenceNumber,

      status:
        input.status,

      updatedAt:
        now,

      //------------------------------------------------
      // Failure
      //------------------------------------------------

      failureCode:
        input.status ===
          "FAILED"
          ? input.failureCode ??
            "TRANSFER_FAILED"
          : current.failureCode,

      failureMessage:
        input.status ===
          "FAILED"
          ? input.failureMessage ??
            "Human transfer failed."
          : current.failureMessage,

      //------------------------------------------------
      // Answered
      //------------------------------------------------

      answeredAt:
        input.status ===
          "ANSWERED"
          ? current.answeredAt ??
            now
          : current.answeredAt,

      //------------------------------------------------
      // Completed
      //------------------------------------------------

      completedAt:
        input.status ===
          "COMPLETED"
          ? current.completedAt ??
            now
          : current.completedAt,
    };

  await saveHumanTransferState(
    next
  );

  return {
    applied:
      true,

    state:
      next,
  };
}

//--------------------------------------------------
// Allowed Provider Transition
//--------------------------------------------------

function isHumanTransferTransitionAllowed(
  current:
    HumanTransferStatus,

  incoming:
    HumanTransferStatus
): boolean {
  //------------------------------------------------
  // Duplicate
  //------------------------------------------------

  if (
    current ===
    incoming
  ) {
    return false;
  }

  //------------------------------------------------
  // Terminal States Never Regress
  //------------------------------------------------

  if (
    current ===
      "FAILED" ||
    current ===
      "CANCELLED" ||
    current ===
      "COMPLETED"
  ) {
    return false;
  }

  //------------------------------------------------
  // REQUESTED
  //------------------------------------------------

  if (
    current ===
    "REQUESTED"
  ) {
    return (
      incoming ===
        "ACCEPTED" ||
      incoming ===
        "DIALING" ||
      incoming ===
        "ANSWERED" ||
      incoming ===
        "FAILED" ||
      incoming ===
        "COMPLETED"
    );
  }

  //------------------------------------------------
  // ACCEPTED
  //------------------------------------------------

  if (
    current ===
    "ACCEPTED"
  ) {
    return (
      incoming ===
        "DIALING" ||
      incoming ===
        "ANSWERED" ||
      incoming ===
        "FAILED" ||
      incoming ===
        "COMPLETED"
    );
  }

  //------------------------------------------------
  // DIALING
  //------------------------------------------------

  if (
    current ===
    "DIALING"
  ) {
    return (
      incoming ===
        "ANSWERED" ||
      incoming ===
        "FAILED" ||
      incoming ===
        "COMPLETED"
    );
  }

  //------------------------------------------------
  // ANSWERED
  //------------------------------------------------

  if (
    current ===
    "ANSWERED"
  ) {
    return (
      incoming ===
        "FAILED" ||
      incoming ===
        "COMPLETED"
    );
  }

  return false;
}

//--------------------------------------------------
// Clear
//--------------------------------------------------

export async function clearHumanTransferState(
  callId:
    string
): Promise<void> {
  await redisConnection.del(
    buildKey(
      callId
    )
  );
}

//--------------------------------------------------
// Update
//--------------------------------------------------

async function updateHumanTransferState(
  callId:
    string,

  status:
    HumanTransferStatus,

  patch?: Partial<
    HumanTransferLifecycleState
  >
): Promise<HumanTransferLifecycleState> {
  const current =
    await getHumanTransferState(
      callId
    );

  const now =
    new Date()
      .toISOString();

  const state:
    HumanTransferLifecycleState =
    {
      callId,

      status,

      requestedAt:
        current
          ?.requestedAt ??
        now,

      updatedAt:
        now,

      provider:
        patch
          ?.provider ??
        current
          ?.provider,

      destination:
        patch
          ?.destination ??
        current
          ?.destination,

      childProviderCallId:
        patch
          ?.childProviderCallId ??
        current
          ?.childProviderCallId,

      lastSequenceNumber:
        patch
          ?.lastSequenceNumber ??
        current
          ?.lastSequenceNumber,

      failureCode:
        patch
          ?.failureCode ??
        current
          ?.failureCode,

      failureMessage:
        patch
          ?.failureMessage ??
        current
          ?.failureMessage,

      answeredAt:
        patch
          ?.answeredAt ??
        current
          ?.answeredAt,

      completedAt:
        patch
          ?.completedAt ??
        current
          ?.completedAt,
    };

  await saveHumanTransferState(
    state
  );

  return state;
}

//--------------------------------------------------
// Save
//--------------------------------------------------

async function saveHumanTransferState(
  state:
    HumanTransferLifecycleState
): Promise<void> {
  await redisConnection.set(
    buildKey(
      state.callId
    ),
    JSON.stringify(
      state
    ),
    "EX",
    resolveTtlSeconds()
  );

  const log =
    createCallLogger(
      state.callId
    );

  log.info(
    {
      event:
        "human_transfer.lifecycle.changed",

      status:
        state.status,

      providerPresent:
        Boolean(
          state.provider
        ),

      destinationPresent:
        Boolean(
          state.destination
        ),

      childProviderCallIdPresent:
        Boolean(
          state.childProviderCallId
        ),

      sequencePresent:
        state.lastSequenceNumber !==
        undefined,
    },
    "Human-transfer lifecycle changed"
  );
}

//--------------------------------------------------
// Key
//--------------------------------------------------

function buildKey(
  callId:
    string
): string {
  return `telephony:human-transfer:${callId}`;
}

//--------------------------------------------------
// TTL
//--------------------------------------------------

function resolveTtlSeconds():
  number {
  const configured =
    Number(
      process.env
        .HUMAN_TRANSFER_STATE_TTL_SECONDS
    );

  if (
    Number.isInteger(
      configured
    ) &&
    configured >=
      300 &&
    configured <=
      86400
  ) {
    return configured;
  }

  return DEFAULT_TTL_SECONDS;
}