import {
  Prisma,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "book-callback-tool"
  );

//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_CALLBACK_REASON_LENGTH =
  500;

const MAX_CALLBACK_HORIZON_DAYS =
  90;

//--------------------------------------------------
// Input Schema
//--------------------------------------------------

export const bookCallbackInputSchema =
  z.object({
    phone:
      z
        .string()
        .trim()
        .min(
          1,
          "Phone number is required"
        ),

    scheduledFor:
      z
        .string()
        .trim()
        .min(
          1,
          "Callback time is required"
        ),

    timezone:
      z
        .string()
        .trim()
        .min(
          1,
          "Timezone is required"
        )
        .max(
          100
        ),

    reason:
      z
        .string()
        .trim()
        .max(
          MAX_CALLBACK_REASON_LENGTH
        )
        .optional(),
  });

//--------------------------------------------------
// Input Type
//--------------------------------------------------

export type BookCallbackInput =
  z.infer<
    typeof bookCallbackInputSchema
  >;

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface BookCallbackResult {
  callbackRequestId:
    string;

  callId:
    string;

  phone:
    string;

  scheduledFor:
    string;

  timezone:
    string;

  status:
    string;

  duplicate:
    boolean;
}

//--------------------------------------------------
// Tool Definition
//--------------------------------------------------

export const bookCallbackTool:
  BusinessToolDefinition =
{
  name:
    "bookCallback",

  description:
    "Creates a confirmed callback request for the current customer call.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    5000,

  inputSchema:
    bookCallbackInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        bookCallbackInputSchema.parse(
          rawInput
        );

      return executeBookCallback(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute Callback
//--------------------------------------------------

async function executeBookCallback(
  input:
    BookCallbackInput,

  context:
    ToolExecutionContext
): Promise<BookCallbackResult> {
  //----------------------------------------------
  // Abort Guard
  //----------------------------------------------

  throwIfAborted(
    context.signal
  );

  //----------------------------------------------
  // Idempotency Key
  //----------------------------------------------

  const idempotencyKey =
    context
      .idempotencyKey
      ?.trim();

  if (
    !idempotencyKey
  ) {
    throw new Error(
      "Idempotency key is required for callback booking"
    );
  }

  //----------------------------------------------
  // Validate Phone
  //----------------------------------------------

  const phone =
    normalizePhoneNumber(
      input.phone
    );

  if (
    !phone
  ) {
    throw new Error(
      "Callback phone number is invalid"
    );
  }

  //----------------------------------------------
  // Validate Timezone
  //----------------------------------------------

  const timezone =
    input.timezone.trim();

  if (
    !isValidTimeZone(
      timezone
    )
  ) {
    throw new Error(
      "Callback timezone is invalid"
    );
  }

  //----------------------------------------------
  // Validate Scheduled Time
  //----------------------------------------------

  const scheduledFor =
    parseScheduledDate(
      input.scheduledFor
    );

  validateCallbackTime(
    scheduledFor
  );

  //----------------------------------------------
  // Verify Call
  //----------------------------------------------

  throwIfAborted(
    context.signal
  );

  const call =
    await prisma.call.findUnique({
      where: {
        id:
          context.callId,
      },

      select: {
        id:
          true,

        contactId:
          true,

        campaignId:
          true,

        direction:
          true,

        status:
          true,
      },
    });

  if (
    !call
  ) {
    throw new Error(
      `Call not found: ${context.callId}`
    );
  }

  //----------------------------------------------
  // Existing Idempotent Request
  //----------------------------------------------

  const existing =
    await prisma
      .callbackRequest
      .findUnique({
        where: {
          idempotencyKey,
        },
      });

  if (
    existing
  ) {
    validateIdempotentOwnership(
      existing.callId,
      context.callId
    );

    log.info(
      {
        event:
          "callback.booking.duplicate",

        callId:
          context.callId,

        callbackRequestId:
          existing.id,

        scheduledFor:
          existing
            .scheduledFor
            .toISOString(),

        requestedBy:
          context.requestedBy,
      },
      "Existing callback request returned"
    );

    return {
      callbackRequestId:
        existing.id,

      callId:
        existing.callId,

      phone:
        existing.phone,

      scheduledFor:
        existing
          .scheduledFor
          .toISOString(),

      timezone:
        existing.timezone,

      status:
        existing.status,

      duplicate:
        true,
    };
  }

  //----------------------------------------------
  // Abort Guard Before Mutation
  //----------------------------------------------

  throwIfAborted(
    context.signal
  );

  //----------------------------------------------
  // Create Request
  //----------------------------------------------

  try {
    const callbackRequest =
      await prisma
        .callbackRequest
        .create({
          data: {
            callId:
              context.callId,

            phone,

            scheduledFor,

            timezone,

            reason:
              input.reason
                ?.trim() ||
              null,

            idempotencyKey,

            requestedBy:
              context.requestedBy,
          },
        });

    log.info(
      {
        event:
          "callback.booking.created",

        callbackRequestId:
          callbackRequest.id,

        callId:
          callbackRequest.callId,

        scheduledFor:
          callbackRequest
            .scheduledFor
            .toISOString(),

        timezone:
          callbackRequest.timezone,

        requestedBy:
          context.requestedBy,

        campaignId:
          call.campaignId,

        contactId:
          call.contactId,

        direction:
          call.direction,
      },
      "Callback request created"
    );

    return {
      callbackRequestId:
        callbackRequest.id,

      callId:
        callbackRequest.callId,

      phone:
        callbackRequest.phone,

      scheduledFor:
        callbackRequest
          .scheduledFor
          .toISOString(),

      timezone:
        callbackRequest.timezone,

      status:
        callbackRequest.status,

      duplicate:
        false,
    };
  } catch (
    error
  ) {
    //--------------------------------------------
    // Concurrent Idempotent Create
    //--------------------------------------------

    if (
      isUniqueConstraintError(
        error
      )
    ) {
      const duplicate =
        await prisma
          .callbackRequest
          .findUnique({
            where: {
              idempotencyKey,
            },
          });

      if (
        duplicate
      ) {
        validateIdempotentOwnership(
          duplicate.callId,
          context.callId
        );

        return {
          callbackRequestId:
            duplicate.id,

          callId:
            duplicate.callId,

          phone:
            duplicate.phone,

          scheduledFor:
            duplicate
              .scheduledFor
              .toISOString(),

          timezone:
            duplicate.timezone,

          status:
            duplicate.status,

          duplicate:
            true,
        };
      }
    }

    log.error(
      {
        event:
          "callback.booking.failed",

        callId:
          context.callId,

        requestedBy:
          context.requestedBy,

        error:
          normalizeError(
            error
          ),
      },
      "Callback request creation failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Normalize Phone
//--------------------------------------------------

function normalizePhoneNumber(
  value:
    string
): string | null {
  const normalized =
    value
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  if (
    !/^\+?[1-9]\d{9,14}$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

//--------------------------------------------------
// Parse Scheduled Date
//--------------------------------------------------

function parseScheduledDate(
  value:
    string
): Date {
  const timestamp =
    Date.parse(
      value
    );

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    throw new Error(
      "Callback scheduled time is invalid"
    );
  }

  return new Date(
    timestamp
  );
}

//--------------------------------------------------
// Validate Callback Time
//--------------------------------------------------

function validateCallbackTime(
  scheduledFor:
    Date
): void {
  const now =
    Date.now();

  if (
    scheduledFor.getTime() <=
    now
  ) {
    throw new Error(
      "Callback time must be in the future"
    );
  }

  const maximumTime =
    now +
    (
      MAX_CALLBACK_HORIZON_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  if (
    scheduledFor.getTime() >
    maximumTime
  ) {
    throw new Error(
      `Callback time cannot be more than ${MAX_CALLBACK_HORIZON_DAYS} days in the future`
    );
  }
}

//--------------------------------------------------
// Timezone Validation
//--------------------------------------------------

function isValidTimeZone(
  timezone:
    string
): boolean {
  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone,
      }
    ).format();

    return true;
  } catch {
    return false;
  }
}

//--------------------------------------------------
// Idempotent Ownership
//--------------------------------------------------

function validateIdempotentOwnership(
  existingCallId:
    string,

  requestedCallId:
    string
): void {
  if (
    existingCallId !==
    requestedCallId
  ) {
    throw new Error(
      "Idempotency key belongs to another call"
    );
  }
}

//--------------------------------------------------
// Unique Constraint
//--------------------------------------------------

function isUniqueConstraintError(
  error:
    unknown
): boolean {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code ===
      "P2002"
  );
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

  if (
    signal.reason instanceof
    Error
  ) {
    throw signal.reason;
  }

  throw new Error(
    "Callback booking was aborted"
  );
}