import {
  ToolExecutionStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

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
  // Tenant Scope Boundary
  //--------------------------------------------------

  const tenantId =
    request.tenantId
      ?.trim();

  /*
   * Current schema does NOT place tenantId on Call,
   * Campaign or Contact.
   *
   * Therefore accepting a tenant-scoped request here
   * would only record the tenant string on the audit;
   * it would NOT prove that the call belongs to that
   * tenant.
   *
   * Fail closed until real ownership exists.
   */

  if (
    tenantId
  ) {
    log.error(
      {
        event:
          "business_tool.tenant_scope_unverifiable",

        callId,

        tool:
          definition.name,

        requestedBy:
          request.requestedBy,

        tenantScopePresent:
          true,
      },
      "Tenant-scoped tool execution rejected because call ownership cannot be verified"
    );

    return failure(
      request,
      startedAt,
      "TENANT_SCOPE_NOT_CONFIGURED",
      "Tenant-scoped tool execution is unavailable until calls have durable tenant ownership"
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
            undefined,

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

const result =
  await definition.handler(
    parsed.data,
    {
      callId,

      tenantId:
        request.tenantId
          ?.trim() ||
        undefined,

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