import {
  MessagingChannel,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  recordMessagingConsent,
} from "@/services/messaging/messaging-consent.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const recordConsentInputSchema =
  z.object({
    phone:
      z
        .string()
        .trim()
        .min(
          1
        ),

    channel:
      z.enum([
        "SMS",
        "WHATSAPP",
      ]),

    status:
      z.enum([
        "OPTED_IN",
        "OPTED_OUT",
      ]),

    source:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          200
        ),

    evidenceText:
      z
        .string()
        .trim()
        .max(
          1000
        )
        .optional(),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const recordConsentTool:
  BusinessToolDefinition =
{
  name:
    "recordConsent",

  description:
    "Records explicit messaging consent or revocation with durable evidence.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    5000,

  inputSchema:
    recordConsentInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        recordConsentInputSchema.parse(
          rawInput
        );

      return executeRecordConsent(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeRecordConsent(
  input:
    z.infer<
      typeof recordConsentInputSchema
    >,

  context:
    ToolExecutionContext
) {
  const log =
    createCallLogger(
      context.callId
    );

  //------------------------------------------------
  // Abort Before Any Work
  //------------------------------------------------

  throwIfAborted(
    context.signal
  );

  //------------------------------------------------
  // Stable Idempotency Required
  //------------------------------------------------

  const idempotencyKey =
    context
      .idempotencyKey
      ?.trim();

  if (
    !idempotencyKey
  ) {
    log.warn(
      {
        event:
          "consent.recording.rejected",

        reason:
          "missing_idempotency_key",

        requestedBy:
          context.requestedBy,
      },
      "Consent recording rejected because idempotency key is missing"
    );

    throw new Error(
      "Consent recording requires a stable idempotency key"
    );
  }

  //------------------------------------------------
  // Audit Start
  //------------------------------------------------

  log.info(
    {
      event:
        "consent.recording.started",

      channel:
        input.channel,

      status:
        input.status,

      requestedBy:
        context.requestedBy,

      idempotencyKeyPresent:
        true,

      evidencePresent:
        Boolean(
          input
            .evidenceText
            ?.trim()
        ),
    },
    "Confirmed consent recording started"
  );

  try {
    //------------------------------------------------
    // Abort Before Database Lookup
    //------------------------------------------------

    throwIfAborted(
      context.signal
    );

    //------------------------------------------------
    // Verify Call
    //------------------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            context.callId,
        },

        select: {
          id:
            true,
        },
      });

    //------------------------------------------------
    // Abort After Lookup
    //------------------------------------------------

    throwIfAborted(
      context.signal
    );

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "consent.recording.rejected",

          reason:
            "call_not_found",

          callId:
            context.callId,
        },
        "Consent recording rejected because call was not found"
      );

      throw new Error(
        `Call not found: ${context.callId}`
      );
    }

    //------------------------------------------------
    // Abort Immediately Before Mutation
    //
    // This is the critical boundary.
    //
    // Once recordMessagingConsent() commits its
    // transaction, consent state and immutable
    // evidence may already be durable.
    //------------------------------------------------

    throwIfAborted(
      context.signal
    );

    //------------------------------------------------
    // Persist Through Consent Service
    //------------------------------------------------

    const result =
      await recordMessagingConsent({
        phone:
          input.phone,

        channel:
          input.channel ===
            "WHATSAPP"
            ? MessagingChannel.WHATSAPP
            : MessagingChannel.SMS,

        status:
          input.status,

        source:
          input.source,

        callId:
          context.callId,

        requestedBy:
          context.requestedBy,

        evidenceText:
          input.evidenceText,

        idempotencyKey,
      });

    //------------------------------------------------
    // Late Abort Detection
    //
    // Do NOT attempt to rollback here.
    //
    // recordMessagingConsent() persists consent state
    // and evidence transactionally. If cancellation
    // happened while that transaction was completing,
    // rolling back afterward would be unsafe.
    //
    // The Tool Gateway will classify this operation
    // as ABORTED / TIMED_OUT instead of reporting a
    // clean synchronous success.
    //------------------------------------------------

    if (
      context.signal
        .aborted
    ) {
      log.warn(
        {
          event:
            "consent.recording.completed_after_abort",

          channel:
            result.channel,

          status:
            result.status,

          evidenceId:
            result.evidenceId,

          duplicate:
            result.duplicate,

          requestedBy:
            context.requestedBy,
        },
        "Consent transaction completed after cancellation signal"
      );

      throwIfAborted(
        context.signal
      );
    }

    //------------------------------------------------
    // Success
    //------------------------------------------------

    log.info(
      {
        event:
          "consent.recording.completed",

        channel:
          result.channel,

        status:
          result.status,

        evidenceId:
          result.evidenceId,

        duplicate:
          result.duplicate,

        requestedBy:
          context.requestedBy,
      },
      result.duplicate
        ? "Existing consent evidence returned for idempotent request"
        : "Consent and durable evidence recorded successfully"
    );

    return {
      phone:
        result.phone,

      channel:
        result.channel,

      status:
        result.status,

      evidenceId:
        result.evidenceId,

      duplicate:
        result.duplicate,
    };
  } catch (
    error
  ) {
    //------------------------------------------------
    // Cancellation / Timeout
    //------------------------------------------------

    if (
      context.signal
        .aborted
    ) {
      const abortError =
        normalizeAbortReason(
          context.signal
            .reason
        );

      log.warn(
        {
          event:
            "consent.recording.aborted",

          channel:
            input.channel,

          status:
            input.status,

          requestedBy:
            context.requestedBy,

          error:
            normalizeError(
              abortError
            ),
        },
        "Consent recording was cancelled or timed out"
      );

      throw abortError;
    }

    //------------------------------------------------
    // Operational Failure
    //------------------------------------------------

    log.error(
      {
        event:
          "consent.recording.failed",

        channel:
          input.channel,

        status:
          input.status,

        requestedBy:
          context.requestedBy,

        error:
          normalizeError(
            error
          ),
      },
      "Consent recording failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Abort Guard
//--------------------------------------------------

function throwIfAborted(
  signal:
    AbortSignal
): void {
  if (
    !signal.aborted
  ) {
    return;
  }

  throw normalizeAbortReason(
    signal.reason
  );
}

//--------------------------------------------------
// Normalize Abort Reason
//--------------------------------------------------

function normalizeAbortReason(
  reason:
    unknown
): Error {
  if (
    reason instanceof
      Error
  ) {
    return reason;
  }

  const error =
    new Error(
      "Consent recording was cancelled"
    );

  error.name =
    "ConsentRecordingAbortError";

  return error;
}