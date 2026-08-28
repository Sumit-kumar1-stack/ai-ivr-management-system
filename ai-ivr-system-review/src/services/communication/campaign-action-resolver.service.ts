import {
  ToolExecutionStatus,
  CallAuthenticationLevel,
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
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  enforceRateLimit,
} from "@/lib/abuse-control";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  hasSufficientAuthLevel,
} from "@/services/security/call-security-session.service";

import type {
  ConversationVoiceOutcome,
} from "@/services/conversations/voice-outcome.service";

//--------------------------------------------------
// Action Type
//--------------------------------------------------

export type CampaignActionType =
  | "MOCK"
  | "WEBHOOK";

//--------------------------------------------------
// Config
//--------------------------------------------------

export interface CampaignActionConfig {
  id:
    string;

  communicationCampaignId:
    string;

  name:
    string;

  actionCode:
    string;

  type:
    CampaignActionType;

  endpoint:
    string | null;

  integrationRef:
    string | null;

  requiredAuthLevel:
    CallAuthenticationLevel;

  requiresConfirmation:
    boolean;

  timeoutMs:
    number;

  enabled:
    boolean;
}

//--------------------------------------------------
// Gateway Decision
//--------------------------------------------------

export type CampaignActionGatewayDecision =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_AUTH"
  | "REQUIRE_CONFIRMATION"
  | "HUMAN_HANDOFF"
  | "RETRY_SAFE";

export interface CampaignActionGatewayRequest {
  actionCode: string;
  tenantId: string;
  campaignId: string;
  callId: string;
  customerRef?: string | null;
  parameters?: Record<string, unknown> | null;
  requestedBy: "AI" | "IVR" | "SYSTEM" | "USER";
  securitySessionId?: string | null;
  confirmed?: boolean;
  idempotencyKey?: string | null;
  turnId?: number;
}

export interface CampaignActionGatewayResult {
  decision: CampaignActionGatewayDecision;
  matched: boolean;
  executed: boolean;
  duplicate: boolean;
  actionCode: string | null;
  type: CampaignActionType | null;
  status: ToolExecutionStatus | null;
  reason: string;
}

//--------------------------------------------------
// Public Result
//--------------------------------------------------

export interface CampaignActionTriggerResult {
  matched:
    boolean;

  executed:
    boolean;

  duplicate:
    boolean;

  actionCode:
    string | null;

  type:
    CampaignActionType | null;

  status:
    ToolExecutionStatus | null;

  reason:
    string;
}

//--------------------------------------------------
// List
//--------------------------------------------------

export async function listCommunicationCampaignActions(
  communicationCampaignId:
    string
): Promise<CampaignActionConfig[]> {
  const id =
    communicationCampaignId.trim();

  if (
    !id
  ) {
    return [];
  }

  const actions =
    await prisma.campaignAction.findMany({
      where: {
        communicationCampaignId:
          id,
      },

      orderBy: [
        {
          enabled:
            "desc",
        },

        {
          createdAt:
            "asc",
        },
      ],
    });

  return actions.map(
    action => ({
      id:
        action.id,

      communicationCampaignId:
        action.communicationCampaignId,

      name:
        action.name,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      endpoint:
        action.endpoint,

      integrationRef:
        action.integrationRef,

      requiredAuthLevel:
        action.requiredAuthLevel,

      requiresConfirmation:
        action.requiresConfirmation,

      timeoutMs:
        action.timeoutMs,

      enabled:
        action.enabled,
    })
  );
}

//--------------------------------------------------
// Create
//--------------------------------------------------

export async function createCommunicationCampaignAction(
  input: {
    communicationCampaignId:
      string;

    name:
      string;

    actionCode:
      string;

    type:
      CampaignActionType;

    endpoint?:
      string | null;

    integrationRef?:
      string | null;

    requiredAuthLevel?:
      CallAuthenticationLevel;

    requiresConfirmation?:
      boolean;

    timeoutMs?:
      number;

    enabled?:
      boolean;
  }
): Promise<CampaignActionConfig> {
  const communicationCampaignId =
    input.communicationCampaignId.trim();

  if (
    !communicationCampaignId
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const name =
    input.name.trim();

  const actionCode =
    input.actionCode.trim().toUpperCase();

  if (
    !name ||
    !actionCode
  ) {
    throw new Error(
      "Campaign action name and action code are required"
    );
  }

  if (
    input.type ===
    "WEBHOOK" &&
    !normalizeOptionalString(
      input.endpoint
    )
  ) {
    throw new Error(
      "Webhook campaign actions require an endpoint"
    );
  }

  const action =
    await prisma.campaignAction.create({
      data: {
        communicationCampaignId,

        name,

        actionCode,

        type:
          input.type,

        endpoint:
          normalizeOptionalString(
            input.endpoint
          ),

        integrationRef:
          normalizeOptionalString(
            input.integrationRef
          ),

        requiredAuthLevel:
          input.requiredAuthLevel ??
          "AUTH_LEVEL_0",

        requiresConfirmation:
          input.requiresConfirmation ??
          false,

        timeoutMs:
          normalizeTimeoutMs(
            input.timeoutMs
          ),

        enabled:
          input.enabled ??
          true,
      },
    });

  return toCampaignActionConfig(
    action
  );
}

//--------------------------------------------------
// Gateway
//--------------------------------------------------

export async function executeCampaignActionGateway(
  request:
    CampaignActionGatewayRequest
): Promise<CampaignActionGatewayResult> {
  const normalizedRequest =
    normalizeCampaignActionGatewayRequest(
      request
    );

  if (
    !normalizedRequest.ok
  ) {
    return normalizedRequest.result;
  }

  const {
    actionCode,
    tenantId,
    campaignId,
    callId,
    customerRef,
    parameters,
    requestedBy,
    securitySessionId,
    confirmed,
    idempotencyKey,
    turnId,
  } =
    normalizedRequest.value;

  const log =
    createCallLogger(
      callId
    );

  const call =
    await getCall(
      callId
    );

  if (
    !call ||
    !call.campaign ||
    !call.contact
  ) {
    return gatewayDenied(
      "call_not_found",
      null,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  const communicationCampaign =
    await prisma.communicationCampaign.findUnique({
      where: {
        id:
          campaignId,
      },

      select: {
        id:
          true,

        ownerUserId:
          true,

        voiceCampaignId:
          true,
      },
    });

  if (
    !communicationCampaign
  ) {
    return gatewayDenied(
      "campaign_not_found",
      null,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  if (
    communicationCampaign.voiceCampaignId !==
    call.campaignId
  ) {
    return gatewayDenied(
      "campaign_call_mismatch",
      communicationCampaign.id,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  const trustedTenantId =
    resolveTrustedTenantId(
      tenantId,
      communicationCampaign.ownerUserId,
      call.campaign.ownerUserId,
      call.contact.ownerUserId
    );

  if (
    !trustedTenantId
  ) {
    return gatewayDenied(
      "tenant_unavailable_or_mismatch",
      communicationCampaign.id,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  if (
    trustedTenantId !== tenantId
  ) {
    return gatewayDenied(
      "tenant_mismatch",
      communicationCampaign.id,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  const action =
    await prisma.campaignAction.findFirst({
      where: {
        communicationCampaignId:
          communicationCampaign.id,

        actionCode,
      },
    });

  if (
    !action
  ) {
    return gatewayDenied(
      "action_not_found",
      communicationCampaign.id,
      log,
      actionCode,
      "DENY",
      null,
      false
    );
  }

  return executeResolvedCampaignAction({
    call,
    communicationCampaign,
    action,
    tenantId:
      trustedTenantId,
    customerRef,
    parameters,
    requestedBy,
    confirmed,
    securitySessionId,
    turnId,
    idempotencyKey,
    outcome:
      null,
    log,
  });
}

//--------------------------------------------------
// Trigger
//--------------------------------------------------

export async function triggerCampaignActionForVoiceOutcome(
  callId:
    string,

  outcome:
    ConversationVoiceOutcome,

  turnId?:
    number
): Promise<CampaignActionTriggerResult> {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return {
      matched:
        false,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        null,

      type:
        null,

      status:
        null,

      reason:
        "call_id_missing",
    };
  }

  const log =
    createCallLogger(
      normalizedCallId
    );

  const call =
    await getCall(
      normalizedCallId
    );

  if (
    !call ||
    !call.campaignId
  ) {
    return {
      matched:
        false,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        null,

      type:
        null,

      status:
        null,

      reason:
        "call_not_found",
    };
  }

  const communicationCampaign =
    await prisma.communicationCampaign.findUnique({
      where: {
        voiceCampaignId:
          call.campaignId,
      },

      select: {
        id:
          true,

        ownerUserId:
          true,

        voiceCampaignId:
          true,
      },
    });

  if (
    !communicationCampaign
  ) {
    return {
      matched:
        false,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        null,

      type:
        null,

      status:
        null,

      reason:
        "communication_campaign_not_found",
    };
  }

  const actionCodes =
    candidateActionCodes(
      outcome
    );

  const action =
    await prisma.campaignAction.findFirst({
      where: {
        communicationCampaignId:
          communicationCampaign.id,

        enabled:
          true,

        actionCode: {
          in:
            actionCodes,
        },
      },
    });

  if (
    !action
  ) {
    return {
      matched:
        false,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        null,

      type:
        null,

      status:
        null,

      reason:
        "no_matching_action",
    };
  }

  const gatewayResult =
    await executeResolvedCampaignAction({
      call,
      communicationCampaign,
      action,
      tenantId:
        resolveTrustedTenantId(
          call.campaign.ownerUserId,
          communicationCampaign.ownerUserId,
          call.contact.ownerUserId
        ) ??
        "",
      customerRef:
        call.contactId,
      parameters:
        normalizeStructuredParameters(
          outcome.entities
        ),
      requestedBy:
        "SYSTEM",
      confirmed:
        outcome.requiresConfirmation,
      securitySessionId:
        normalizedCallId,
      turnId:
        turnId ?? null,
      idempotencyKey:
        null,
      outcome,
      log,
    });

  return {
    matched:
      gatewayResult.matched,

    executed:
      gatewayResult.executed,

    duplicate:
      gatewayResult.duplicate,

    actionCode:
      gatewayResult.actionCode,

    type:
      gatewayResult.type,

    status:
      gatewayResult.status,

    reason:
      gatewayResult.reason,
  };
}

//--------------------------------------------------
// Shared Gateway Execution
//--------------------------------------------------

async function executeResolvedCampaignAction(
  input: {
    call:
      Awaited<
        ReturnType<
          typeof getCall
        >
      >;

    communicationCampaign:
      {
        id: string;
        ownerUserId: string | null;
        voiceCampaignId: string | null;
      };

    action:
      {
        id: string;
        communicationCampaignId: string;
        name: string;
        actionCode: string;
        type: string;
        endpoint: string | null;
        integrationRef: string | null;
        requiredAuthLevel: CallAuthenticationLevel;
        requiresConfirmation: boolean;
        timeoutMs: number;
        enabled: boolean;
      };

    tenantId: string;

    customerRef: string | null;

    parameters:
      Record<string, unknown> | null;

    requestedBy:
      "AI" | "IVR" | "SYSTEM" | "USER";

    confirmed:
      boolean;

    securitySessionId:
      string | null;

    turnId:
      number | null;

    idempotencyKey?:
      string | null;

    outcome:
      ConversationVoiceOutcome | null;

    log:
      ReturnType<typeof createCallLogger>;
  }
): Promise<CampaignActionGatewayResult> {
  const {
    call,
    communicationCampaign,
    action,
    tenantId,
    customerRef,
    parameters,
    requestedBy,
    confirmed,
    securitySessionId,
    turnId,
    idempotencyKey,
    outcome,
    log,
  } = input;

  const audit = (
    event:
      AppEvent,
    payload:
      Record<string, unknown>
  ): void => {
    void EventPublisher.publish(
      event,
      {
        callId:
          call?.id ?? "",

        campaignId:
          communicationCampaign.id,

        tenantId,

        customerRef:
          (customerRef?.trim() ||
            call?.contactId) ??
          "",

        actionCode:
          action.actionCode,

        actorType:
          requestedBy,

        ...payload,
      }
    );
  };

  if (
    !call ||
    !call.campaign ||
    !call.contact
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "DENY",

        reason:
          "call_not_found",
      }
    );

    return gatewayDenied(
      "call_not_found",
      communicationCampaign.id,
      log,
      action.actionCode,
      "DENY",
      action.type as CampaignActionType,
      false
    );
  }

  audit(
    AppEvent.ACTION_REQUESTED,
    {
      requestedBy,

      requestedAction:
        action.actionCode,

      requestedAuthLevel:
        action.requiredAuthLevel,

      confirmed,

      securitySessionIdPresent:
        Boolean(
          securitySessionId
        ),
    }
  );

  const trustedTenantId =
    resolveTrustedTenantId(
      tenantId,
      communicationCampaign.ownerUserId,
      call.campaign.ownerUserId,
      call.contact.ownerUserId
    );

  if (
    !trustedTenantId ||
    trustedTenantId !== tenantId
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "DENY",

        reason:
          "tenant_mismatch",
      }
    );

    return gatewayDenied(
      "tenant_mismatch",
      communicationCampaign.id,
      log,
      action.actionCode,
      "DENY",
      action.type as CampaignActionType
    );
  }

  if (
    securitySessionId &&
    securitySessionId.trim() !==
      call.id
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "DENY",

        reason:
          "security_session_mismatch",
      }
    );

    return gatewayDenied(
      "security_session_mismatch",
      communicationCampaign.id,
      log,
      action.actionCode,
      "DENY",
      action.type as CampaignActionType
    );
  }

  if (
    !action.enabled
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "DENY",

        reason:
          "disabled_integration",
      }
    );

    return gatewayDenied(
      "disabled_integration",
      communicationCampaign.id,
      log,
      action.actionCode,
      "DENY",
      action.type as CampaignActionType
    );
  }

  if (
    isRestrictedCampaignActionCode(
      action.actionCode
    )
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "HUMAN_HANDOFF",

        reason:
          "restricted_operation",
      }
    );

    return gatewayDenied(
      "restricted_operation",
      communicationCampaign.id,
      log,
      action.actionCode,
      "HUMAN_HANDOFF",
      action.type as CampaignActionType
    );
  }

  if (
    action.requiresConfirmation &&
    !confirmed
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "REQUIRE_CONFIRMATION",

        reason:
          "confirmation_required",
      }
    );

    log.info(
      {
        event:
          "campaign_action.gateway_confirmation_required",

        actionCode:
          action.actionCode,

        campaignId:
          communicationCampaign.id,
      },
      "Campaign action requires confirmation"
    );

    return {
      decision:
        "REQUIRE_CONFIRMATION",

      matched:
        true,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      status:
        null,

      reason:
        "confirmation_required",
    };
  }

  if (
    !hasSufficientAuthLevel(
      call.authenticationLevel,
      action.requiredAuthLevel
    )
  ) {
    audit(
      AppEvent.POLICY_DENIED,
      {
        decision:
          "REQUIRE_AUTH",

        reason:
          "REQUIRE_AUTH",
      }
    );

    log.info(
      {
        event:
          "campaign_action.gateway_auth_required",

        actionCode:
          action.actionCode,

        requiredAuthLevel:
          action.requiredAuthLevel,

        currentAuthLevel:
          call.authenticationLevel,
      },
      "Campaign action requires a higher authentication level"
    );

    return {
      decision:
        "REQUIRE_AUTH",

      matched:
        true,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      status:
        null,

      reason:
        "REQUIRE_AUTH",
    };
  }

  const normalizedCustomerRef =
    normalizeOptionalString(
      customerRef
    ) ??
    call.contactId;

  const normalizedParameters =
    parameters ??
    null;

  const normalizedIdempotencyKey =
    normalizeOptionalString(
      idempotencyKey
    ) ??
    `campaign-action:${call.id}:${action.id}:${
      turnId ?? "call"
    }`;

  const toolName =
    `campaignAction:${action.id}`;

  audit(
    AppEvent.POLICY_ALLOWED,
    {
      decision:
        "ALLOW",

      requiredAuthLevel:
        action.requiredAuthLevel,

      confirmed,
    }
  );

  const existing =
    await prisma.toolExecution.findUnique({
      where: {
        tool_idempotencyKey: {
          tool:
            toolName,

          idempotencyKey:
            normalizedIdempotencyKey,
        },
      },

      select: {
        id:
          true,

        callId:
          true,

        status:
          true,
      },
    });

  if (
    existing
  ) {
    if (
      existing.callId !==
      call.id
    ) {
      throw new Error(
        "Campaign action idempotency key belongs to another call"
      );
    }

    log.info(
      {
        event:
          "campaign_action.idempotent_existing",

        actionCode:
          action.actionCode,

        status:
          existing.status,
      },
      "Campaign action execution already exists"
    );

    return {
      decision:
        "RETRY_SAFE",

      matched:
        true,

      executed:
        existing.status ===
        ToolExecutionStatus.SUCCEEDED,

      duplicate:
        true,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      status:
        existing.status,

      reason:
        "duplicate",
    };
  }

  const rateLimit =
    await enforceRateLimit({
      scope:
        "campaign-action",

      limit:
        10,

      windowMs:
        60 *
        1000,

      keyParts: [
        trustedTenantId,

        communicationCampaign.id,

        call.id,

        action.actionCode,
      ],
    });

  if (
    !rateLimit.allowed
  ) {
    log.warn(
      {
        event:
          "campaign_action.rate_limited",

        actionCode:
          action.actionCode,

        current:
          rateLimit.current,

        limit:
          rateLimit.limit,
      },
      "Campaign action execution rate limited"
    );

    return gatewayDenied(
      "rate_limited",
      communicationCampaign.id,
      log,
      action.actionCode,
      "DENY",
      action.type as CampaignActionType,
      true
    );
  }

  const execution =
    await prisma.toolExecution.create({
      data: {
        callId:
          call.id,

        tenantId:
          trustedTenantId,

        tool:
          toolName,

        requestedBy,

        idempotencyKey:
          normalizedIdempotencyKey,

        status:
          ToolExecutionStatus.STARTED,

        requiresConfirmation:
          action.requiresConfirmation,

        confirmed:
          confirmed ||
          !action.requiresConfirmation,

        mutating:
          true,
      },
    });

  const startedAt =
    process.hrtime.bigint();

  try {
    if (
      action.type ===
      "WEBHOOK"
    ) {
      await executeWebhookCampaignAction(
        action,
        communicationCampaign.id,
        call.id,
        normalizedCustomerRef,
        normalizedParameters,
        requestedBy,
        securitySessionId,
        tenantId,
        outcome,
        turnId
      );
    } else {
      // No-op mock action: the durable audit row is the
      // observable business outcome.
    }

    await prisma.toolExecution.update({
      where: {
        id:
          execution.id,
      },

      data: {
        status:
          ToolExecutionStatus.SUCCEEDED,

        durationMs:
          getDurationMs(
            startedAt
          ),

        completedAt:
          new Date(),
      },
    });

    audit(
      AppEvent.ACTION_EXECUTED,
      {
        decision:
          "ALLOW",

        status:
          ToolExecutionStatus.SUCCEEDED,

        duplicate:
          false,

        executed:
          true,
      }
    );

    log.info(
      {
        event:
          "campaign_action.executed",

        actionCode:
          action.actionCode,

        type:
          action.type,

        status:
          ToolExecutionStatus.SUCCEEDED,

        duplicate:
          false,
      },
      "Campaign action executed"
    );

    return {
      decision:
        "ALLOW",

      matched:
        true,

      executed:
        true,

      duplicate:
        false,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      status:
        ToolExecutionStatus.SUCCEEDED,

      reason:
        "executed",
    };
  } catch (
    error
  ) {
    const normalizedError =
      normalizeError(
        error
      );

    const errorCode =
      normalizeErrorCode(
        normalizedError.code
      );

    const status =
      isTimeoutError(
        normalizedError.message
      )
        ? ToolExecutionStatus.TIMED_OUT
        : ToolExecutionStatus.FAILED;

    await prisma.toolExecution.update({
      where: {
        id:
          execution.id,
      },

      data: {
        status,

        durationMs:
          getDurationMs(
            startedAt
          ),

        completedAt:
          new Date(),

        errorCode:
          errorCode,

        errorMessage:
          normalizedError.message.slice(
            0,
            1000
          ),
      },
    });

    audit(
      AppEvent.ACTION_FAILED,
      {
        decision:
          status ===
          ToolExecutionStatus.TIMED_OUT
            ? "RETRY_SAFE"
            : "DENY",

        status,

        reason:
          errorCode,

        duplicate:
          false,

        executed:
          false,
      }
    );

    log.error(
      {
        event:
          "campaign_action.execution_failed",

        actionCode:
          action.actionCode,

        type:
          action.type,

        error:
          normalizedError,
      },
      "Campaign action execution failed"
    );

    return {
      decision:
        status ===
        ToolExecutionStatus.TIMED_OUT
          ? "RETRY_SAFE"
          : "DENY",

      matched:
        true,

      executed:
        false,

      duplicate:
        false,

      actionCode:
        action.actionCode,

      type:
        action.type as CampaignActionType,

      status,

      reason:
        errorCode,
    };
  }
}

//--------------------------------------------------
// Helpers
//--------------------------------------------------

const REQUESTED_BY_VALUES =
  new Set([
    "AI",
    "IVR",
    "SYSTEM",
    "USER",
  ] as const);

const RESTRICTED_CAMPAIGN_ACTION_CODES =
  new Set([
    "MOVE_FUNDS",
    "TRANSFER_FUNDS",
    "PAYMENT",
    "PROCESS_PAYMENT",
    "UPDATE_PIN",
    "RESET_PIN",
    "CHANGE_PIN",
    "ACCOUNT_SECURITY",
    "CHANGE_PASSWORD",
    "PASSWORD_RESET",
    "LOAN_APPROVAL",
    "APPROVE_LOAN",
    "DISBURSE_LOAN",
  ]);

function normalizeCampaignActionGatewayRequest(
  request:
    CampaignActionGatewayRequest
):
  | {
      ok: true;
      value: {
        actionCode: string;
        tenantId: string;
        campaignId: string;
        callId: string;
        customerRef: string | null;
        parameters: Record<string, unknown> | null;
        requestedBy: "AI" | "IVR" | "SYSTEM" | "USER";
        securitySessionId: string | null;
        confirmed: boolean;
        idempotencyKey: string | null;
        turnId: number | null;
      };
    }
  | {
      ok: false;
      result: CampaignActionGatewayResult;
    } {
  try {
    const actionCode =
      normalizeOptionalString(
        request.actionCode
      )?.toUpperCase();

    const tenantId =
      normalizeOptionalString(
        request.tenantId
      );

    const campaignId =
      normalizeOptionalString(
        request.campaignId
      );

    const callId =
      normalizeOptionalString(
        request.callId
      );

    const requestedBy =
      normalizeOptionalString(
        request.requestedBy
      )?.toUpperCase() as
        | "AI"
        | "IVR"
        | "SYSTEM"
        | "USER"
        | undefined;

    if (
      !actionCode ||
      !tenantId ||
      !campaignId ||
      !callId ||
      !requestedBy ||
      !REQUESTED_BY_VALUES.has(
        requestedBy
      )
    ) {
      return {
        ok: false,
        result:
          gatewayDenied(
            "malformed_payload",
            null,
            null,
            actionCode ?? null,
            "DENY",
            null,
            false
          ),
      };
    }

    if (
      request.confirmed !==
        undefined &&
      typeof request.confirmed !==
        "boolean"
    ) {
      return {
        ok: false,
        result:
          gatewayDenied(
            "malformed_payload",
            null,
            null,
            actionCode,
            "DENY",
            null,
            false
          ),
      };
    }

    if (
      request.turnId !==
        undefined &&
      (
        !Number.isInteger(
          request.turnId
        ) ||
        request.turnId < 0
      )
    ) {
      return {
        ok: false,
        result:
          gatewayDenied(
            "malformed_payload",
            null,
            null,
            actionCode,
            "DENY",
            null,
            false
          ),
      };
    }

    const normalizedParameters =
      normalizeStructuredParameters(
        request.parameters
      );

    return {
      ok: true,
      value: {
        actionCode,
        tenantId,
        campaignId,
        callId,
        customerRef:
          normalizeOptionalString(
            request.customerRef
          ),
        parameters:
          normalizedParameters,
        requestedBy,
        securitySessionId:
          normalizeOptionalString(
            request.securitySessionId
          ),
        confirmed:
          request.confirmed ??
          false,
        idempotencyKey:
          normalizeOptionalString(
            request.idempotencyKey
          ),
        turnId:
          request.turnId ??
          null,
      },
    };
  } catch {
    return {
      ok: false,
      result:
        gatewayDenied(
          "malformed_payload",
          null,
          null,
          null,
          "DENY",
          null,
          false
        ),
    };
  }
}

function gatewayDenied(
  reason:
    string,
  campaignId:
    string | null,
  log:
    ReturnType<typeof createCallLogger> | null,
  actionCode:
    string | null,
  decision:
    CampaignActionGatewayDecision = "DENY",
  type:
    CampaignActionType | null = null,
  matched:
    boolean = true
): CampaignActionGatewayResult {
  log?.info(
    {
      event:
        "campaign_action.gateway_denied",

      reason,

      campaignId,

      actionCode,
    },
    "Campaign action gateway denied"
  );

  return {
    decision,

    matched,

    executed:
      false,

    duplicate:
      false,

    actionCode,

    type,

    status:
      null,

    reason,
  };
}

function resolveTrustedTenantId(
  ...owners:
    Array<string | null | undefined>
): string | null {
  const normalized =
    owners
      .map(
        value =>
          normalizeOptionalString(
            value
          )
      )
      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      );

  if (
    normalized.length ===
    0
  ) {
    return null;
  }

  const [first, ...rest] =
    normalized;

  if (
    !rest.every(
      value =>
        value === first
    )
  ) {
    return null;
  }

  return first;
}

function isRestrictedCampaignActionCode(
  actionCode:
    string
): boolean {
  return RESTRICTED_CAMPAIGN_ACTION_CODES.has(
    actionCode.trim().toUpperCase()
  );
}

function normalizeStructuredParameters(
  parameters:
    unknown
): Record<string, unknown> | null {
  if (
    parameters ===
      null ||
    parameters ===
      undefined
  ) {
    return null;
  }

  if (
    !isPlainRecord(
      parameters
    )
  ) {
    throw new Error(
      "Campaign action parameters must be a plain JSON object"
    );
  }

  return sanitizeStructuredRecord(
    parameters
  );
}

function sanitizeStructuredRecord(
  record:
    Record<string, unknown>,
  depth:
    number = 0
): Record<string, unknown> {
  if (
    depth > 8
  ) {
    throw new Error(
      "Campaign action parameters exceed the supported nesting depth"
    );
  }

  const output:
    Record<string, unknown> = {};

  for (
    const [key, value] of Object.entries(
      record
    )
  ) {
    if (
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor"
    ) {
      continue;
    }

    output[key] =
      sanitizeStructuredValue(
        value,
        depth + 1
      );
  }

  return output;
}

function sanitizeStructuredValue(
  value:
    unknown,
  depth:
    number
): unknown {
  if (
    value === null
  ) {
    return null;
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      item =>
        sanitizeStructuredValue(
          item,
          depth + 1
        )
    );
  }

  if (
    isPlainRecord(
      value
    )
  ) {
    return sanitizeStructuredRecord(
      value,
      depth + 1
    );
  }

  throw new Error(
    "Campaign action parameters must be JSON serializable"
  );
}

function isPlainRecord(
  value:
    unknown
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value
    );

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

function candidateActionCodes(
  outcome:
    ConversationVoiceOutcome
): string[] {
  const codes =
    [
      outcome.intent,
      outcome.requestedAction,
    ]
      .map(
        value =>
          value.trim().toUpperCase()
      );

  return [
    ...new Set(
      codes.filter(
        Boolean
      )
    ),
  ];
}

function normalizeOptionalString(
  value?:
    string | null
): string | null {
  const normalized =
    value
      ?.trim()
      ?? "";

  return normalized
    ? normalized
    : null;
}

function normalizeTimeoutMs(
  timeoutMs?:
    number
): number {
  if (
    typeof timeoutMs !==
    "number"
  ) {
    return 10_000;
  }

  if (
    Number.isInteger(
      timeoutMs
    ) &&
    timeoutMs >= 1_000 &&
    timeoutMs <= 120_000
  ) {
    return timeoutMs;
  }

  return 10_000;
}

function normalizeErrorCode(
  code:
    string | number | undefined
): string {
  if (
    typeof code ===
    "string"
  ) {
    return code;
  }

  if (
    typeof code ===
    "number"
  ) {
    return String(
      code
    );
  }

  return "unknown_error";
}

function toCampaignActionConfig(
  action: {
    id:
      string;

    communicationCampaignId:
      string;

    name:
      string;

    actionCode:
      string;

    type:
      string;

    endpoint:
      string | null;

    integrationRef:
      string | null;

    requiredAuthLevel:
      CallAuthenticationLevel;

    requiresConfirmation:
      boolean;

    timeoutMs:
      number;

    enabled:
      boolean;
  }
): CampaignActionConfig {
  return {
    id:
      action.id,

    communicationCampaignId:
      action.communicationCampaignId,

    name:
      action.name,

    actionCode:
      action.actionCode,

    type:
      action.type as CampaignActionType,

    endpoint:
      action.endpoint,

    integrationRef:
      action.integrationRef,

    requiredAuthLevel:
      action.requiredAuthLevel,

    requiresConfirmation:
      action.requiresConfirmation,

    timeoutMs:
      action.timeoutMs,

    enabled:
      action.enabled,
  };
}

async function executeWebhookCampaignAction(
  action: {
    endpoint:
      string | null;

    actionCode:
      string;

    type:
      string;

    timeoutMs:
      number;
  },

  communicationCampaignId:
    string,

  callId:
    string,

  customerRef:
    string | null,

  parameters:
    Record<string, unknown> | null,

  requestedBy:
    "AI" | "IVR" | "SYSTEM" | "USER",

  securitySessionId:
    string | null,

  tenantId:
    string,

  outcome:
    ConversationVoiceOutcome | null,

  turnId?:
    number | null
): Promise<Record<string, unknown>> {
  const endpoint =
    resolveCampaignActionEndpoint(
      action.endpoint
    );

  const timeoutController =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        timeoutController.abort(
          new Error(
            `Campaign action timed out after ${action.timeoutMs}ms`
          )
        );
      },
      action.timeoutMs
    );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              actionCode:
                action.actionCode,

              campaignId:
                communicationCampaignId,

              callId,

              customerRef:
                customerRef,

              tenantId,

              requestedBy,

              securitySessionId,

              parameters,

              conversation: {
                outcome:
                  outcome
                    ? {
                        intent:
                          outcome.intent,

                        confidence:
                          outcome.confidence,

                        requestedAction:
                          outcome.requestedAction,

                        requiresConfirmation:
                          outcome.requiresConfirmation,
                      }
                    : null,

                turnId:
                  turnId ??
                  null,
              },
            }),

          signal:
            timeoutController.signal,
        }
      );

    const text =
      await response.text();

    if (
      !response.ok
    ) {
      throw new Error(
        `Webhook returned ${response.status}`
      );
    }

    return {
      actionCode:
        action.actionCode,

      type:
        action.type,

      endpoint:
        endpoint.toString(),

      responseStatus:
        response.status,

      responseBody:
        text.slice(
          0,
          500
        ),
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

function resolveCampaignActionEndpoint(
  endpoint:
    string | null
): URL {
  const trimmed =
    endpoint?.trim() ?? "";

  if (
    !trimmed
  ) {
    throw new Error(
      "Campaign action endpoint is required for webhook actions"
    );
  }

  if (
    trimmed.startsWith(
      "/"
    )
  ) {
    const baseUrl =
      getAppBaseUrl();

    if (
      !baseUrl
    ) {
      throw new Error(
        "APP_URL or BASE_URL is required for relative campaign action endpoints"
      );
    }

    return new URL(
      trimmed,
      baseUrl
    );
  }

  const url =
    new URL(
      trimmed
    );

  if (
    url.username ||
    url.password
  ) {
    throw new Error(
      "Campaign action endpoints must not include credentials"
    );
  }

  if (
    url.protocol !==
    "https:"
  ) {
    throw new Error(
      "Campaign action endpoints must use HTTPS"
    );
  }

  const allowedHosts =
    new Set(
      (
        process.env
          .CAMPAIGN_ACTION_ALLOWED_HOSTS ??
        ""
      )
        .split(
          ","
        )
        .map(
          value =>
            value
              .trim()
              .toLowerCase()
        )
        .filter(
          Boolean
        )
    );

  if (
    allowedHosts.size ===
    0 ||
    !allowedHosts.has(
      url.hostname
        .trim()
        .toLowerCase()
    )
  ) {
    throw new Error(
      "Campaign action endpoint host is not allowlisted"
    );
  }

  return url;
}

function getAppBaseUrl():
  string | null {
  return (
    process.env.BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    null
  )
    ?.trim()
    .replace(
      /\/+$/,
      ""
    ) ?? null;
}

function isTimeoutError(
  message: string
): boolean {
  return /timed out|abort/i.test(
    message
  );
}
