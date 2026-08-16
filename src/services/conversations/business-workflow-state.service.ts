import {
  randomUUID,
} from "node:crypto";

import {
  redisConnection,
} from "@/lib/redis";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Workflow Type
//--------------------------------------------------

export type BusinessWorkflowType =
  | "CALLBACK"
  | "LEAD";

//--------------------------------------------------
// Workflow Stage
//--------------------------------------------------

export type BusinessWorkflowStage =
  | "COLLECTING"
  | "AWAITING_CONFIRMATION"
  | "EXECUTING"
  | "COMPLETED"
  | "CANCELLED";

//--------------------------------------------------
// Callback Data
//--------------------------------------------------

export interface CallbackWorkflowData {
  phone?:
    string;

  scheduledFor?:
    string;

  timezone?:
    string;

  reason?:
    string;
}

//--------------------------------------------------
// Lead Data
//--------------------------------------------------

export interface LeadWorkflowData {
  fullName?:
    string;

  phone?:
    string;

  email?:
    string;

  interest?:
    string;

  notes?:
    string;
}

//--------------------------------------------------
// Workflow State
//--------------------------------------------------

export interface BusinessWorkflowState {
  id:
    string;

  callId:
    string;

  type:
    BusinessWorkflowType;

  stage:
    BusinessWorkflowStage;

  callback?:
    CallbackWorkflowData;

  lead?:
    LeadWorkflowData;

  createdAt:
    string;

  updatedAt:
    string;
}

//--------------------------------------------------
// Constants
//--------------------------------------------------

const WORKFLOW_TTL_SECONDS =
  resolveWorkflowTtlSeconds();

//--------------------------------------------------
// Start Callback
//--------------------------------------------------

export async function startCallbackWorkflow(
  callId:
    string,

  initial?:
    CallbackWorkflowData
): Promise<BusinessWorkflowState> {
  const now =
    new Date()
      .toISOString();

  const state:
    BusinessWorkflowState =
    {
      id:
        randomUUID(),

      callId,

      type:
        "CALLBACK",

      stage:
        "COLLECTING",

      callback: {
        ...initial,
      },

      createdAt:
        now,

      updatedAt:
        now,
    };

  await saveBusinessWorkflowState(
    state
  );

  return state;
}

//--------------------------------------------------
// Start Lead
//--------------------------------------------------

export async function startLeadWorkflow(
  callId:
    string,

  initial?:
    LeadWorkflowData
): Promise<BusinessWorkflowState> {
  const now =
    new Date()
      .toISOString();

  const state:
    BusinessWorkflowState =
    {
      id:
        randomUUID(),

      callId,

      type:
        "LEAD",

      stage:
        "COLLECTING",

      lead: {
        ...initial,
      },

      createdAt:
        now,

      updatedAt:
        now,
    };

  await saveBusinessWorkflowState(
    state
  );

  return state;
}

//--------------------------------------------------
// Get
//--------------------------------------------------

export async function getBusinessWorkflowState(
  callId:
    string
): Promise<BusinessWorkflowState | null> {
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

  try {
    const parsed =
      JSON.parse(
        raw
      ) as BusinessWorkflowState;

    if (
      !parsed ||
      parsed.callId !==
        callId
    ) {
      await clearBusinessWorkflowState(
        callId
      );

      return null;
    }

    return parsed;
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
          "business_workflow.state_parse_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Business workflow state could not be parsed"
    );

    await clearBusinessWorkflowState(
      callId
    );

    return null;
  }
}

//--------------------------------------------------
// Save
//--------------------------------------------------

export async function saveBusinessWorkflowState(
  state:
    BusinessWorkflowState
): Promise<void> {
  const updated:
    BusinessWorkflowState =
    {
      ...state,

      updatedAt:
        new Date()
          .toISOString(),
    };

  await redisConnection.set(
    buildKey(
      state.callId
    ),
    JSON.stringify(
      updated
    ),
    "EX",
    WORKFLOW_TTL_SECONDS
  );
}

//--------------------------------------------------
// Update Callback
//--------------------------------------------------

export async function updateCallbackWorkflow(
  callId:
    string,

  patch:
    Partial<CallbackWorkflowData>
): Promise<BusinessWorkflowState> {
  const current =
    await requireWorkflow(
      callId,
      "CALLBACK"
    );

  const updated:
    BusinessWorkflowState =
    {
      ...current,

      callback: {
        ...current.callback,
        ...removeUndefined(
          patch
        ),
      },

      updatedAt:
        new Date()
          .toISOString(),
    };

  await saveBusinessWorkflowState(
    updated
  );

  return updated;
}

//--------------------------------------------------
// Update Lead
//--------------------------------------------------

export async function updateLeadWorkflow(
  callId:
    string,

  patch:
    Partial<LeadWorkflowData>
): Promise<BusinessWorkflowState> {
  const current =
    await requireWorkflow(
      callId,
      "LEAD"
    );

  const updated:
    BusinessWorkflowState =
    {
      ...current,

      lead: {
        ...current.lead,
        ...removeUndefined(
          patch
        ),
      },

      updatedAt:
        new Date()
          .toISOString(),
    };

  await saveBusinessWorkflowState(
    updated
  );

  return updated;
}

//--------------------------------------------------
// Set Stage
//--------------------------------------------------

export async function setBusinessWorkflowStage(
  callId:
    string,

  stage:
    BusinessWorkflowStage
): Promise<BusinessWorkflowState> {
  const current =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !current
  ) {
    throw new Error(
      `Business workflow not found for call ${callId}`
    );
  }

  const updated:
    BusinessWorkflowState =
    {
      ...current,

      stage,

      updatedAt:
        new Date()
          .toISOString(),
    };

  await saveBusinessWorkflowState(
    updated
  );

  return updated;
}

//--------------------------------------------------
// Cancel
//--------------------------------------------------

export async function cancelBusinessWorkflow(
  callId:
    string
): Promise<void> {
  const current =
    await getBusinessWorkflowState(
      callId
    );

  if (
    current
  ) {
    await saveBusinessWorkflowState({
      ...current,

      stage:
        "CANCELLED",

      updatedAt:
        new Date()
          .toISOString(),
    });
  }

  await clearBusinessWorkflowState(
    callId
  );
}

//--------------------------------------------------
// Clear
//--------------------------------------------------

export async function clearBusinessWorkflowState(
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
// Require Workflow
//--------------------------------------------------

async function requireWorkflow(
  callId:
    string,

  type:
    BusinessWorkflowType
): Promise<BusinessWorkflowState> {
  const current =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !current
  ) {
    throw new Error(
      `No active ${type} workflow for call ${callId}`
    );
  }

  if (
    current.type !==
    type
  ) {
    throw new Error(
      `Expected ${type} workflow but ${current.type} is active`
    );
  }

  if (
    current.stage ===
      "COMPLETED" ||
    current.stage ===
      "CANCELLED"
  ) {
    throw new Error(
      `${type} workflow is no longer active`
    );
  }

  return current;
}

//--------------------------------------------------
// Remove Undefined
//--------------------------------------------------

function removeUndefined<
  T extends Record<
    string,
    unknown
  >
>(
  value:
    T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(
      value
    ).filter(
      (
        [
          ,
          item,
        ]
      ) =>
        item !==
        undefined
    )
  ) as Partial<T>;
}

//--------------------------------------------------
// Redis Key
//--------------------------------------------------

function buildKey(
  callId:
    string
): string {
  return `conversation:business-workflow:${callId}`;
}

//--------------------------------------------------
// TTL
//--------------------------------------------------

function resolveWorkflowTtlSeconds():
  number {
  const value =
    Number(
      process.env
        .BUSINESS_WORKFLOW_TTL_SECONDS
    );

  if (
    Number.isFinite(
      value
    ) &&
    value >=
      60 &&
    value <=
      86400
  ) {
    return Math.round(
      value
    );
  }

  return 3600;
}