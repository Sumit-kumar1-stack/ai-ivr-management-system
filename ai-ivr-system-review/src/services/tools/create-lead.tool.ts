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
    "create-lead-tool"
  );

//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_NAME_LENGTH =
  150;

const MAX_EMAIL_LENGTH =
  320;

const MAX_INTEREST_LENGTH =
  500;

const MAX_NOTES_LENGTH =
  1000;

//--------------------------------------------------
// Input Schema
//--------------------------------------------------

export const createLeadInputSchema =
  z
    .object({
      fullName:
        z
          .string()
          .trim()
          .max(
            MAX_NAME_LENGTH
          )
          .optional(),

      phone:
        z
          .string()
          .trim()
          .optional(),

      email:
        z
          .string()
          .trim()
          .max(
            MAX_EMAIL_LENGTH
          )
          .optional(),

      interest:
        z
          .string()
          .trim()
          .min(
            1,
            "Lead interest is required"
          )
          .max(
            MAX_INTEREST_LENGTH
          ),

      notes:
        z
          .string()
          .trim()
          .max(
            MAX_NOTES_LENGTH
          )
          .optional(),
    })
    .superRefine(
      (
        value,
        context
      ) => {
        if (
          !value.phone &&
          !value.email
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,

            message:
              "At least one contact method is required",

            path: [
              "phone",
            ],
          });
        }
      }
    );

//--------------------------------------------------
// Input Type
//--------------------------------------------------

export type CreateLeadInput =
  z.infer<
    typeof createLeadInputSchema
  >;

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CreateLeadResult {
  leadId:
    string;

  callId:
    string;

  status:
    string;

  duplicate:
    boolean;
}

//--------------------------------------------------
// Tool Definition
//--------------------------------------------------

export const createLeadTool:
  BusinessToolDefinition =
{
  name:
    "createLead",

  description:
    "Creates a validated lead from a confirmed customer interest captured during a call.",

  risk:
    "LOW",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    5000,

  inputSchema:
    createLeadInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        createLeadInputSchema.parse(
          rawInput
        );

      return executeCreateLead(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute Create Lead
//--------------------------------------------------

async function executeCreateLead(
  input:
    CreateLeadInput,

  context:
    ToolExecutionContext
): Promise<CreateLeadResult> {
  //--------------------------------------------------
  // Abort Guard
  //--------------------------------------------------

  throwIfAborted(
    context.signal
  );

  //--------------------------------------------------
  // Idempotency Key
  //--------------------------------------------------

  const idempotencyKey =
    context
      .idempotencyKey
      ?.trim();

  if (
    !idempotencyKey
  ) {
    throw new Error(
      "Idempotency key is required for lead creation"
    );
  }

  //--------------------------------------------------
  // Normalize Contact Data
  //--------------------------------------------------

  const phone =
    input.phone
      ? normalizePhoneNumber(
          input.phone
        )
      : null;

  const email =
    normalizeEmail(
      input.email
    );

  if (
    input.phone &&
    !phone
  ) {
    throw new Error(
      "Lead phone number is invalid"
    );
  }

  if (
    input.email &&
    !email
  ) {
    throw new Error(
      "Lead email address is invalid"
    );
  }

  if (
    !phone &&
    !email
  ) {
    throw new Error(
      "At least one valid contact method is required"
    );
  }

  //--------------------------------------------------
  // Verify Call
  //--------------------------------------------------

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

  //--------------------------------------------------
  // Existing Idempotent Lead
  //--------------------------------------------------

  const existing =
    await prisma.lead.findUnique({
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
          "lead.creation.duplicate",

        leadId:
          existing.id,

        callId:
          context.callId,

        status:
          existing.status,

        requestedBy:
          context.requestedBy,
      },
      "Existing lead returned for idempotent request"
    );

    return {
      leadId:
        existing.id,

      callId:
        existing.callId,

      status:
        existing.status,

      duplicate:
        true,
    };
  }

  //--------------------------------------------------
  // Abort Before Mutation
  //--------------------------------------------------

  throwIfAborted(
    context.signal
  );

  //--------------------------------------------------
  // Create Lead
  //--------------------------------------------------

  try {
    const lead =
      await prisma.lead.create({
        data: {
          callId:
            context.callId,

          fullName:
            input.fullName
              ?.trim() ||
            null,

          phone,

          email,

          interest:
            input.interest.trim(),

          notes:
            input.notes
              ?.trim() ||
            null,

          source:
            "AI_IVR",

          idempotencyKey,

          createdBy:
            context.requestedBy,
        },
      });

    log.info(
      {
        event:
          "lead.creation.completed",

        leadId:
          lead.id,

        callId:
          lead.callId,

        status:
          lead.status,

        campaignId:
          call.campaignId,

        contactId:
          call.contactId,

        direction:
          call.direction,

        requestedBy:
          context.requestedBy,
      },
      "Lead created through Tool Gateway"
    );

    return {
      leadId:
        lead.id,

      callId:
        lead.callId,

      status:
        lead.status,

      duplicate:
        false,
    };
  } catch (
    error
  ) {
    //------------------------------------------------
    // Concurrent Idempotency Collision
    //------------------------------------------------

    if (
      isUniqueConstraintError(
        error
      )
    ) {
      const duplicate =
        await prisma.lead.findUnique({
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
          leadId:
            duplicate.id,

          callId:
            duplicate.callId,

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
          "lead.creation.failed",

        callId:
          context.callId,

        requestedBy:
          context.requestedBy,

        error:
          normalizeError(
            error
          ),
      },
      "Lead creation failed"
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
// Normalize Email
//--------------------------------------------------

function normalizeEmail(
  value:
    string |
    undefined
): string | null {
  if (
    !value
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
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
      "Lead idempotency key belongs to another call"
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
    "Lead creation was aborted"
  );
}