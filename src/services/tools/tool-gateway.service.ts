import {
  ToolExecutionStatus,
  CallAuthenticationLevel,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import { StandardRuntimeUsage } from "@/services/voice-runtime/standard-runtime-usage.service";

import {
  enforceRateLimit,
} from "@/lib/abuse-control";

import {
  getBusinessTool,
} from "./tool-registry.service";

import {
  registerDefaultBusinessTools,
} from "./register-default-tools.service";

import {
  completeToolExecutionAudit,
  reconcileStaleToolExecutions,
  startToolExecutionAudit,
} from "./tool-execution-audit.service";

import type {
  StartToolExecutionAuditResult,
} from "./tool-execution-audit.service";

import type {
  ExecuteBusinessToolRequest,
  ToolExecutionFailure,
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "business-tool-gateway"
  );

//--------------------------------------------------
// Execute Tool
//--------------------------------------------------

export async function executeBusinessTool(
  request:
    ExecuteBusinessToolRequest
): Promise<ToolExecutionResult> {
  const startedAt =
    process.hrtime.bigint();

  //--------------------------------------------------
  // Register Tools
  //--------------------------------------------------

  registerDefaultBusinessTools();

  //--------------------------------------------------
  // Resolve Tool
  //--------------------------------------------------

  const definition =
    getBusinessTool(
      request.tool
    );

  if (
    !definition
  ) {
    return failure(
      request,
      startedAt,
      "TOOL_NOT_REGISTERED",
      `Business tool is not registered: ${request.tool}`
    );
  }

  //--------------------------------------------------
  // Normalize Call ID
  //--------------------------------------------------

  const callId =
    request.callId
      .trim();

  if (
    !callId
  ) {
    return failure(
      request,
      startedAt,
      "INVALID_CALL_ID",
      "Call ID is required"
    );
  }

  //--------------------------------------------------
  // Validate Call Exists
  //--------------------------------------------------

  const call =
    await prisma.call
      .findUnique({
        where: {
          id:
            callId,
        },

        select: {
          id:
            true,

          status:
            true,

          campaignId:
            true,

          contactId:
            true,

          tenantId:
            true,

          authenticationLevel:
            true,

          campaign: {
            select: {
              ownerUser: {
                select: {
                  tenantId: true,
                },
              },
            },
          },
        },
      });

  if (
    !call
  ) {
    log.warn(
      {
        event:
          "business_tool.call_not_found",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,
      },
      "Business tool rejected because call does not exist"
    );

    return failure(
      request,
      startedAt,
      "CALL_NOT_FOUND",
      "Business tool call context does not exist"
    );
  }

  //--------------------------------------------------
  // Authentication Boundary
  //--------------------------------------------------

  const requiredAuthLevel =
    normalizeAuthLevel(
      definition.requiredAuthLevel
    );

  if (
    !hasSufficientAuthLevel(
      call.authenticationLevel,
      requiredAuthLevel
    )
  ) {
    log.warn(
      {
        event:
          "business_tool.authentication_required",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        currentAuthLevel:
          call.authenticationLevel,

        requiredAuthLevel,
      },
      "Business tool rejected because customer authentication is insufficient"
    );

    return failure(
      request,
      startedAt,
      "AUTH_LEVEL_REQUIRED",
      `Additional customer authentication is required before executing ${definition.name}`
    );
  }

  //--------------------------------------------------
  // Tenant Scope Boundary
  //--------------------------------------------------

  const requestedTenantId =
    request.tenantId
      ?.trim() ?? "";

  const tenantId =
    call.tenantId ??
    call.campaign?.ownerUser?.tenantId ??
    null;

  if (
    !tenantId ||
    (
      requestedTenantId &&
      requestedTenantId !== tenantId
    )
  ) {
    log.error(
      {
        event: "business_tool.tenant_scope_denied",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        tenantScopePresent: Boolean(
          requestedTenantId
        ),
      },
      "Business tool rejected because the call tenant scope is missing or mismatched"
    );

    return failure(
      request,
      startedAt,
      "TENANT_SCOPE_DENIED",
      "Business tool call context is not authorized for this tenant"
    );
  }

  //--------------------------------------------------
  // Confirmation Guard
  //--------------------------------------------------

  if (
    definition
      .requiresConfirmation &&
    request.confirmed !==
      true
  ) {
    return failure(
      request,
      startedAt,
      "CONFIRMATION_REQUIRED",
      `Confirmation is required before executing ${definition.name}`
    );
  }

  //--------------------------------------------------
  // Idempotency Guard
  //--------------------------------------------------

  const idempotencyKey =
    request
      .idempotencyKey
      ?.trim();

  if (
    definition.mutating &&
    !idempotencyKey
  ) {
    return failure(
      request,
      startedAt,
      "IDEMPOTENCY_KEY_REQUIRED",
      `Idempotency key is required for mutating tool ${definition.name}`
    );
  }

  //--------------------------------------------------
  // Validate Input
  //--------------------------------------------------

  const parsed =
    definition
      .inputSchema
      .safeParse(
        request.input
      );

  if (
    !parsed.success
  ) {
    log.warn(
      {
        event:
          "business_tool.validation_failed",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        issues:
          parsed.error.issues.map(
            issue => ({
              path:
                issue.path.join(
                  "."
                ),

              message:
                issue.message,
            })
          ),
      },
      "Business tool input validation failed"
    );

    return failure(
      request,
      startedAt,
      "VALIDATION_FAILED",
      "Business tool input is invalid"
    );
  }

  //--------------------------------------------------
  // Reconcile Abandoned Audits
  //--------------------------------------------------

  await reconcileStaleToolExecutions();

  //--------------------------------------------------
  // Start Durable Audit
  //--------------------------------------------------

  let audit:
    StartToolExecutionAuditResult;

  try {
    audit =
      await startToolExecutionAudit({
        request: {
          ...request,

          callId,

          tenantId:
            tenantId,

          idempotencyKey,
        },

        definition,
      });
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "business_tool.audit_required_failed",

        callId,

        tool:
          definition.name,

        error:
          normalizeError(
            error
          ),
      },
      "Business tool blocked because durable audit could not start"
    );

    return failure(
      request,
      startedAt,
      "AUDIT_PERSISTENCE_FAILED",
      "Business action could not be safely audited"
    );
  }

  //--------------------------------------------------
  // Existing Execution
  //--------------------------------------------------

  if (
    !audit.created
  ) {
    return resolveExistingExecution({
      request,

      startedAt,

      callId,

      tool:
        definition.name,

      audit,
    });
  }

  const executionId =
    audit.executionId;

  //--------------------------------------------------
  // Abuse Protection
  //--------------------------------------------------

  const rateLimit =
    await enforceRateLimit({
      scope:
        definition.name ===
        "searchKnowledgeBase"
          ? "tool-search"
          : "tool-mutation",

      limit:
        definition.name ===
        "searchKnowledgeBase"
          ? 30
          : 10,

      windowMs:
        60 *
        1000,

      keyParts: [
        callId,

        definition.name,

        request.requestedBy,
      ],
    });

  if (
    !rateLimit.allowed
  ) {
    log.warn(
      {
        event:
          "business_tool.rate_limited",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        current:
          rateLimit.current,

        limit:
          rateLimit.limit,
      },
      "Business tool execution rate limited"
    );

    await completeToolExecutionAudit({
      executionId,

      durationMs:
        getDurationMs(
          startedAt
        ),

      status:
        ToolExecutionStatus.ABORTED,

      errorCode:
        "RATE_LIMITED",

      errorMessage:
        "Business tool execution rate limit exceeded",
    });

    return failure(
      request,
      startedAt,
      "RATE_LIMITED",
      "Too many requests for this business action"
    );
  }

  //--------------------------------------------------
  // Abort Controller
  //--------------------------------------------------

  const controller =
    new AbortController();

  let timeoutTriggered =
    false;

  const timeout =
    setTimeout(
      () => {
        timeoutTriggered =
          true;

        controller.abort(
          new Error(
            `Business tool timed out after ${definition.timeoutMs}ms`
          )
        );
      },
      definition.timeoutMs
    );

  //--------------------------------------------------
  // Parent Cancellation
  //--------------------------------------------------

  const parentSignal =
    request.signal;

  const onParentAbort =
    () => {
      controller.abort(
        parentSignal
          ?.reason
      );
    };

  if (
    parentSignal
  ) {
    if (
      parentSignal.aborted
    ) {
      onParentAbort();
    } else {
      parentSignal.addEventListener(
        "abort",
        onParentAbort,
        {
          once:
            true,
        }
      );
    }
  }

  //--------------------------------------------------
  // Cancelled Before Handler
  //--------------------------------------------------

  if (
    controller.signal.aborted
  ) {
    const durationMs =
      getDurationMs(
        startedAt
      );

    await completeAuditBestEffort({
      executionId,

      durationMs,

      status:
        ToolExecutionStatus.ABORTED,

      errorCode:
        "TOOL_ABORTED",

      errorMessage:
        "Business tool execution was cancelled before execution.",

      callId,

      tool:
        definition.name,
    });

    clearTimeout(
      timeout
    );

    if (
      parentSignal
    ) {
      parentSignal.removeEventListener(
        "abort",
        onParentAbort
      );
    }

    return failure(
      request,
      startedAt,
      "TOOL_ABORTED",
      "Business tool execution was cancelled"
    );
  }

  //--------------------------------------------------
  // Execute Handler
  //--------------------------------------------------

  try {
    log.info(
      {
        event:
          "business_tool.execution.started",

        executionId,

        callId,

        tool:
          definition.name,

        risk:
          definition.risk,

        mutating:
          definition.mutating,

        requestedBy:
          request.requestedBy,

        hasIdempotencyKey:
          Boolean(
            idempotencyKey
          ),

        timeoutMs:
          definition.timeoutMs,
      },
      "Business tool execution started"
    );

    StandardRuntimeUsage.recordTool(
      callId
    );

const result =
  await definition.handler(
    parsed.data,
    {
      callId,

      tenantId:
        tenantId,

      idempotencyKey,

      requestedBy:
        request.requestedBy,

      signal:
        controller.signal,
    }
  );

//------------------------------------------------
// Late Completion Guard
//
// A provider/database operation may resolve after
// its timeout signal fired.
//
// Never report that late completion as a successful
// Gemini business-tool result.
//------------------------------------------------

if (
  controller.signal
    .aborted
) {
  const reason =
    controller.signal
      .reason;

  if (
    reason instanceof
    Error
  ) {
    throw reason;
  }

  throw new Error(
    "Business tool completed after cancellation"
  );
}

const durationMs =
  getDurationMs(
    startedAt
  );

    //------------------------------------------------
    // Handler Returned After Timeout/Abort
    //------------------------------------------------

    if (
      controller.signal.aborted
    ) {
      const parentAborted =
        Boolean(
          parentSignal
            ?.aborted
        );

      const code =
        timeoutTriggered &&
        !parentAborted
          ? "TOOL_TIMEOUT"
          : "TOOL_ABORTED";

      const status =
        code ===
          "TOOL_TIMEOUT"
          ? ToolExecutionStatus.TIMED_OUT
          : ToolExecutionStatus.ABORTED;

      await completeAuditBestEffort({
        executionId,

        durationMs,

        status,

        errorCode:
          code,

        errorMessage:
          code ===
            "TOOL_TIMEOUT"
            ? "Business tool execution timed out."
            : "Business tool execution was cancelled.",

        callId,

        tool:
          definition.name,
      });

      return failure(
        request,
        startedAt,
        code,
        code ===
          "TOOL_TIMEOUT"
          ? "Business tool execution timed out"
          : "Business tool execution was cancelled"
      );
    }

    //------------------------------------------------
    // Persist Success
    //------------------------------------------------

    await completeAuditBestEffort({
      executionId,

      durationMs,

      status:
        ToolExecutionStatus.SUCCEEDED,

      callId,

      tool:
        definition.name,
    });

    //------------------------------------------------
    // Return Success
    //------------------------------------------------

    log.info(
      {
        event:
          "business_tool.execution.completed",

        executionId,

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        durationMs,
      },
      "Business tool execution completed"
    );

    return {
      success:
        true,

      tool:
        definition.name,

      callId,

      durationMs,

      result,
    };
  } catch (
    error
  ) {
    const normalized =
      normalizeError(
        error
      );

    const parentAborted =
      Boolean(
        parentSignal
          ?.aborted
      );

    const gatewayAborted =
      controller.signal
        .aborted;

    const timedOut =
      timeoutTriggered &&
      gatewayAborted &&
      !parentAborted;

    const code =
      timedOut
        ? "TOOL_TIMEOUT"
        : gatewayAborted
          ? "TOOL_ABORTED"
          : "TOOL_EXECUTION_FAILED";

    const auditStatus =
      timedOut
        ? ToolExecutionStatus.TIMED_OUT
        : gatewayAborted
          ? ToolExecutionStatus.ABORTED
          : ToolExecutionStatus.FAILED;

    const durationMs =
      getDurationMs(
        startedAt
      );

    //------------------------------------------------
    // Persist Failure
    //------------------------------------------------

    await completeAuditBestEffort({
      executionId,

      durationMs,

      status:
        auditStatus,

      errorCode:
        code,

      errorMessage:
        normalized.message,

      callId,

      tool:
        definition.name,
    });

    //------------------------------------------------
    // Failure Log
    //------------------------------------------------

    log.error(
      {
        event:
          "business_tool.execution.failed",

        executionId,

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        code,

        durationMs,

        error:
          normalized,
      },
      "Business tool execution failed"
    );

    return failure(
      request,
      startedAt,
      code,
      timedOut
        ? "Business tool execution timed out"
        : gatewayAborted
          ? "Business tool execution was cancelled"
          : normalized.message
    );
  } finally {
    clearTimeout(
      timeout
    );

    if (
      parentSignal
    ) {
      parentSignal.removeEventListener(
        "abort",
        onParentAbort
      );
    }
  }
}

//--------------------------------------------------
// Resolve Existing Execution
//--------------------------------------------------

function resolveExistingExecution(
  input: {
    request:
      ExecuteBusinessToolRequest;

    startedAt:
      bigint;

    callId:
      string;

    tool:
      ExecuteBusinessToolRequest["tool"];

    audit:
      StartToolExecutionAuditResult;
  }
): ToolExecutionResult {
  //------------------------------------------------
  // Already Succeeded
  //------------------------------------------------

  if (
    input.audit.status ===
    ToolExecutionStatus.SUCCEEDED
  ) {
    log.info(
      {
        event:
          "business_tool.idempotent_replay",

        executionId:
          input.audit.executionId,

        callId:
          input.callId,

        tool:
          input.tool,

        previousStatus:
          input.audit.status,
      },
      "Duplicate business tool execution suppressed"
    );

    return {
      success:
        true,

      tool:
        input.tool,

      callId:
        input.callId,

      durationMs:
        getDurationMs(
          input.startedAt
        ),

      result: {
        duplicate:
          true,

        idempotentReplay:
          true,

        executionId:
          input.audit
            .executionId,

        previousStatus:
          input.audit
            .status,
      },
    };
  }

  //------------------------------------------------
  // Still Executing
  //------------------------------------------------

  if (
    input.audit.status ===
    ToolExecutionStatus.STARTED
  ) {
    return failure(
      input.request,
      input.startedAt,
      "TOOL_EXECUTION_IN_PROGRESS",
      "An execution with this idempotency key is already in progress"
    );
  }

  //------------------------------------------------
  // Terminal Non-Success
  //------------------------------------------------

  return failure(
    input.request,
    input.startedAt,
    "IDEMPOTENT_EXECUTION_ALREADY_FINALIZED",
    `This idempotency key already finished with status ${input.audit.status}`
  );
}

//--------------------------------------------------
// Complete Audit Best Effort
//--------------------------------------------------

async function completeAuditBestEffort(
  input: {
    executionId:
      string;

    durationMs:
      number;

    status:
      ToolExecutionStatus;

    errorCode?:
      string;

    errorMessage?:
      string;

    callId:
      string;

    tool:
      string;
  }
): Promise<void> {
  try {
    await completeToolExecutionAudit({
      executionId:
        input.executionId,

      durationMs:
        input.durationMs,

      status:
        input.status,

      errorCode:
        input.errorCode,

      errorMessage:
        input.errorMessage,
    });
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "business_tool.audit_completion_failed",

        executionId:
          input.executionId,

        callId:
          input.callId,

        tool:
          input.tool,

        requestedStatus:
          input.status,

        error:
          normalizeError(
            error
          ),
      },
      "Business tool completed but audit terminal-state persistence failed"
    );
  }
}

//--------------------------------------------------
// Failure Result
//--------------------------------------------------

function failure(
  request:
    ExecuteBusinessToolRequest,

  startedAt:
    bigint,

  code:
    string,

  message:
    string
): ToolExecutionFailure {
  return {
    success:
      false,

    tool:
      request.tool,

    callId:
      request.callId
        .trim(),

    durationMs:
      getDurationMs(
        startedAt
      ),

    error: {
      code,

      message,
    },
  };
}

function hasSufficientAuthLevel(
  currentLevel:
    CallAuthenticationLevel | string | null | undefined,
  requiredLevel:
    CallAuthenticationLevel
): boolean {
  return (
    authLevelRank(
      currentLevel
    ) >=
    authLevelRank(
      requiredLevel
    )
  );
}

function normalizeAuthLevel(
  level:
    CallAuthenticationLevel | string | null | undefined
): CallAuthenticationLevel {
  if (
    level === "AUTH_LEVEL_1" ||
    level === "AUTH_LEVEL_2" ||
    level === "AUTH_LEVEL_3"
  ) {
    return level;
  }

  return "AUTH_LEVEL_0";
}

function authLevelRank(
  level:
    CallAuthenticationLevel | string | null | undefined
): number {
  switch (
    normalizeAuthLevel(
      level
    )
  ) {
    case "AUTH_LEVEL_1":
      return 1;

    case "AUTH_LEVEL_2":
      return 2;

    case "AUTH_LEVEL_3":
      return 3;

    case "AUTH_LEVEL_0":
    default:
      return 0;
  }
}
