import {
  Prisma,
  ToolExecutionStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  BusinessToolDefinition,
  ExecuteBusinessToolRequest,
} from "./tool-gateway.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "tool-execution-audit"
  );

//--------------------------------------------------
// Reconciliation Runtime
//--------------------------------------------------

const DEFAULT_STALE_SECONDS =
  15 * 60;

const MIN_STALE_SECONDS =
  60;

const MAX_STALE_SECONDS =
  24 * 60 * 60;

const RECONCILIATION_INTERVAL_MS =
  60_000;

let lastReconciliationAtMs =
  0;

//--------------------------------------------------
// Start Audit Input
//--------------------------------------------------

export interface StartToolExecutionAuditInput {
  request:
    ExecuteBusinessToolRequest;

  definition:
    BusinessToolDefinition;
}

//--------------------------------------------------
// Start Audit Result
//--------------------------------------------------

export interface StartToolExecutionAuditResult {
  executionId:
    string;

  created:
    boolean;

  status:
    ToolExecutionStatus;
}

//--------------------------------------------------
// Completion Input
//--------------------------------------------------

export interface CompleteToolExecutionAuditInput {
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
}

//--------------------------------------------------
// Existing Execution
//--------------------------------------------------

async function findExistingExecution(
  tool:
    string,

  idempotencyKey:
    string
): Promise<{
  id:
    string;

  callId:
    string;

  status:
    ToolExecutionStatus;
} | null> {
  return prisma.toolExecution
    .findUnique({
      where: {
        tool_idempotencyKey: {
          tool,

          idempotencyKey,
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
}

//--------------------------------------------------
// Validate Existing Ownership
//--------------------------------------------------

function assertExecutionOwnership(
  existing: {
    callId:
      string;
  },

  request:
    ExecuteBusinessToolRequest
): void {
  if (
    existing.callId !==
    request.callId
  ) {
    throw new Error(
      "Tool idempotency key belongs to another call"
    );
  }
}

//--------------------------------------------------
// Existing Result
//--------------------------------------------------

function existingResult(
  existing: {
    id:
      string;

    status:
      ToolExecutionStatus;
  }
): StartToolExecutionAuditResult {
  return {
    executionId:
      existing.id,

    created:
      false,

    status:
      existing.status,
  };
}

//--------------------------------------------------
// Reconcile Stale Executions
//--------------------------------------------------

export async function reconcileStaleToolExecutions(
  force =
    false
): Promise<number> {
  const nowMs =
    Date.now();

  //------------------------------------------------
  // Throttle Global Reconciliation
  //------------------------------------------------

  if (
    !force &&
    nowMs -
      lastReconciliationAtMs <
      RECONCILIATION_INTERVAL_MS
  ) {
    return 0;
  }

  /*
   * Set before DB access.
   *
   * Concurrent requests do not all need to run the
   * same cleanup query.
   */

  lastReconciliationAtMs =
    nowMs;

  //------------------------------------------------
  // Resolve Stale Threshold
  //------------------------------------------------

  const staleSeconds =
    getStaleExecutionSeconds();

  const cutoff =
    new Date(
      nowMs -
        staleSeconds *
          1000
    );

  const completedAt =
    new Date(
      nowMs
    );

  try {
    //------------------------------------------------
    // Recover Abandoned STARTED Records
    //------------------------------------------------

    const result =
      await prisma.toolExecution
        .updateMany({
          where: {
            status:
              ToolExecutionStatus.STARTED,

            startedAt: {
              lt:
                cutoff,
            },
          },

          data: {
            status:
              ToolExecutionStatus.ABORTED,

            completedAt,

            errorCode:
              "STALE_TOOL_EXECUTION",

            errorMessage:
              "Tool execution was abandoned before a terminal audit state was recorded.",
          },
        });

    //------------------------------------------------
    // Audit Reconciliation
    //------------------------------------------------

    if (
      result.count >
      0
    ) {
      log.warn(
        {
          event:
            "tool.audit.stale_reconciled",

          recoveredCount:
            result.count,

          staleSeconds,

          cutoff:
            cutoff.toISOString(),
        },
        "Stale business tool executions were reconciled"
      );
    }

    return result.count;
  } catch (
    error
  ) {
    /*
     * Do not turn reconciliation into an execution
     * retry mechanism.
     *
     * If cleanup fails, an existing STARTED record
     * remains STARTED and therefore continues to block
     * duplicate execution.
     */

    log.error(
      {
        event:
          "tool.audit.stale_reconciliation_failed",

        staleSeconds,

        cutoff:
          cutoff.toISOString(),

        error:
          normalizeError(
            error
          ),
      },
      "Stale business tool execution reconciliation failed"
    );

    return 0;
  }
}

//--------------------------------------------------
// Start Execution Audit
//--------------------------------------------------

export async function startToolExecutionAudit(
  input:
    StartToolExecutionAuditInput
): Promise<StartToolExecutionAuditResult> {
  try {
    const idempotencyKey =
      input.request
        .idempotencyKey
        ?.trim() ||
      null;

    //------------------------------------------------
    // Existing Idempotency Record
    //------------------------------------------------

    if (
      idempotencyKey
    ) {
      const existing =
        await findExistingExecution(
          input.definition.name,
          idempotencyKey
        );

      if (
        existing
      ) {
        assertExecutionOwnership(
          existing,
          input.request
        );

        log.warn(
          {
            event:
              "tool.audit.idempotency_existing",

            executionId:
              existing.id,

            callId:
              input.request.callId,

            tool:
              input.definition.name,

            status:
              existing.status,
          },
          "Existing tool execution audit record found"
        );

        return existingResult(
          existing
        );
      }
    }

    //------------------------------------------------
    // Create Execution Record
    //------------------------------------------------

    try {
      const execution =
        await prisma.toolExecution
          .create({
            data: {
              callId:
                input.request.callId,

              tool:
                input.definition.name,

              requestedBy:
                input.request.requestedBy,

              tenantId:
                input.request
                  .tenantId
                  ?.trim() ||
                null,

              idempotencyKey,

              status:
                ToolExecutionStatus.STARTED,

              requiresConfirmation:
                input.definition
                  .requiresConfirmation,

              confirmed:
                input.request
                  .confirmed ===
                true,

              mutating:
                input.definition
                  .mutating,
            },

            select: {
              id:
                true,

              status:
                true,
            },
          });

      log.info(
        {
          event:
            "tool.audit.started",

          executionId:
            execution.id,

          callId:
            input.request.callId,

          tool:
            input.definition.name,

          requestedBy:
            input.request.requestedBy,
        },
        "Business tool execution audit started"
      );

      return {
        executionId:
          execution.id,

        created:
          true,

        status:
          execution.status,
      };
    } catch (
      error
    ) {
      //------------------------------------------------
      // Concurrent Idempotency Creation
      //------------------------------------------------

      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2002" &&
        idempotencyKey
      ) {
        const existing =
          await findExistingExecution(
            input.definition.name,
            idempotencyKey
          );

        if (
          existing
        ) {
          assertExecutionOwnership(
            existing,
            input.request
          );

          log.warn(
            {
              event:
                "tool.audit.idempotency_race_resolved",

              executionId:
                existing.id,

              callId:
                input.request.callId,

              tool:
                input.definition.name,

              status:
                existing.status,
            },
            "Concurrent duplicate tool execution audit resolved"
          );

          return existingResult(
            existing
          );
        }
      }

      throw error;
    }
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "tool.audit.start_failed",

        callId:
          input.request.callId,

        tool:
          input.definition.name,

        error:
          normalizeError(
            error
          ),
      },
      "Business tool execution audit could not be started"
    );

    throw error;
  }
}

//--------------------------------------------------
// Complete Execution Audit
//--------------------------------------------------

export async function completeToolExecutionAudit(
  input:
    CompleteToolExecutionAuditInput
): Promise<void> {
  try {
    /*
     * Only STARTED can move to terminal.
     *
     * A late handler completion cannot overwrite an
     * execution already recovered as stale ABORTED.
     */

    const updated =
      await prisma.toolExecution
        .updateMany({
          where: {
            id:
              input.executionId,

            status:
              ToolExecutionStatus.STARTED,
          },

          data: {
            status:
              input.status,

            durationMs:
              Math.max(
                0,
                Math.round(
                  input.durationMs
                )
              ),

            errorCode:
              input.errorCode ??
              null,

            errorMessage:
              sanitizeErrorMessage(
                input.errorMessage
              ),

            completedAt:
              new Date(),
          },
        });

    //------------------------------------------------
    // Already Terminal
    //------------------------------------------------

    if (
      updated.count ===
      0
    ) {
      const existing =
        await prisma.toolExecution
          .findUnique({
            where: {
              id:
                input.executionId,
            },

            select: {
              status:
                true,
            },
          });

      log.warn(
        {
          event:
            "tool.audit.completion_skipped",

          executionId:
            input.executionId,

          requestedStatus:
            input.status,

          existingStatus:
            existing?.status,
        },
        "Tool execution audit was already terminal"
      );

      return;
    }

    //------------------------------------------------
    // Completed
    //------------------------------------------------

    log.info(
      {
        event:
          "tool.audit.completed",

        executionId:
          input.executionId,

        status:
          input.status,

        durationMs:
          input.durationMs,

        errorCode:
          input.errorCode,
      },
      "Business tool execution audit completed"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "tool.audit.complete_failed",

        executionId:
          input.executionId,

        status:
          input.status,

        error:
          normalizeError(
            error
          ),
      },
      "Business tool execution audit completion failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Resolve Stale Threshold
//--------------------------------------------------

function getStaleExecutionSeconds():
  number {
  const raw =
    process.env
      .TOOL_EXECUTION_STALE_SECONDS
      ?.trim();

  const parsed =
    raw
      ? Number(
          raw
        )
      : DEFAULT_STALE_SECONDS;

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return DEFAULT_STALE_SECONDS;
  }

  return Math.min(
    MAX_STALE_SECONDS,
    Math.max(
      MIN_STALE_SECONDS,
      Math.round(
        parsed
      )
    )
  );
}

//--------------------------------------------------
// Error Message Sanitization
//--------------------------------------------------

function sanitizeErrorMessage(
  value:
    string |
    undefined
): string | null {
  if (
    !value
  ) {
    return null;
  }

  return value
    .trim()
    .slice(
      0,
      500
    );
}