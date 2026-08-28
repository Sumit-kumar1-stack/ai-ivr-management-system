import {
  CallDirection,
  CallStatus,
  CampaignStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  createLogger,
  maskPhoneNumber,
  normalizeError,
} from "@/lib/logger";

import {
  IVRMenuSessionService,
} from "@/services/ivr/ivr-menu-session.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const INBOUND_CAMPAIGN_SYSTEM_KEY =
  "INBOUND_ENQUIRIES";

const DEFAULT_LANGUAGE =
  "English";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createLogger({
    component:
      "inbound-call-service",
  });

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface CreateInboundCallInput {
  providerCallId:
    string;

  callerNumber:
    string;

  calledNumber:
    string;

  language?:
    string;
}

export interface CreateInboundCallResult {
  callId:
    string;

  contactId:
    string;

  campaignId:
    string;

  created:
    boolean;
}

//--------------------------------------------------
// Create Or Get
//--------------------------------------------------

export async function createOrGetInboundCall(
  input:
    CreateInboundCallInput
): Promise<CreateInboundCallResult> {
  const providerCallId =
    input.providerCallId
      .trim();

  const callerNumber =
    normalizePhoneNumber(
      input.callerNumber
    );

  const calledNumber =
    normalizePhoneNumber(
      input.calledNumber
    );

  const language =
    input.language
      ?.trim() ||
    DEFAULT_LANGUAGE;

  //------------------------------------------------
  // Validation
  //------------------------------------------------

  if (
    !providerCallId
  ) {
    throw new Error(
      "Provider CallSid is required"
    );
  }

  if (
    !callerNumber
  ) {
    throw new Error(
      "Caller phone number is required"
    );
  }

  if (
    !calledNumber
  ) {
    throw new Error(
      "Called phone number is required"
    );
  }

  //------------------------------------------------
  // Existing Provider Call
  //------------------------------------------------

  const existingCall =
    await prisma.call
      .findUnique({
        where: {
          providerCallId,
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
    existingCall
  ) {
    if (
      existingCall.direction !==
      CallDirection.INBOUND
    ) {
      throw new Error(
        "Provider CallSid is already associated with an outbound call"
      );
    }

    /*
     * Twilio may retry the webhook.
     * The existing call remains authoritative.
     */
    return {
      callId:
        existingCall.id,

      contactId:
        existingCall.contactId,

      campaignId:
        existingCall.campaignId,

      created:
        false,
    };
  }

  //------------------------------------------------
  // Create
  //------------------------------------------------

  try {
    const result =
      await prisma.$transaction(
        async transaction => {
          //------------------------------------------
          // System Inbound Campaign
          //------------------------------------------

          const campaign =
            await transaction
              .campaign
              .upsert({
                where: {
                  systemKey:
                    INBOUND_CAMPAIGN_SYSTEM_KEY,
                },

                update: {
                  status:
                    CampaignStatus.RUNNING,

                  language,
                },

                create: {
                  name:
                    "Inbound Enquiries",

                  description:
                    "System campaign used to track incoming enquiry calls.",

                  systemKey:
                    INBOUND_CAMPAIGN_SYSTEM_KEY,

                  language,

                  voice:
                    "Female",

                  status:
                    CampaignStatus.RUNNING,

                  startedAt:
                    new Date(),
                },

                select: {
                  id:
                    true,
                },
              });

          //------------------------------------------
          // Caller Contact
          //------------------------------------------

          const contact =
            await transaction
              .contact
              .upsert({
                where: {
                  phone:
                    callerNumber,
                },

                update: {
                  language,
                },

                create: {
                  fullName:
                    buildInboundCallerName(
                      callerNumber
                    ),

                  phone:
                    callerNumber,

                  language,
                },

                select: {
                  id:
                    true,
                },
              });

          //------------------------------------------
          // Call
          //------------------------------------------

          const now =
            new Date();

          const call =
            await transaction
              .call
              .create({
                data: {
                  providerCallId,

                  direction:
                    CallDirection.INBOUND,

                  callerNumber,

                  calledNumber,

                  campaignId:
                    campaign.id,

                  campaignRunId:
                    null,

                  contactId:
                    contact.id,

                  contactPhoneSnapshot:
                    callerNumber,

                  providerDestination:
                    calledNumber,

                  usedDevelopmentOverride:
                    false,

                  language,

                  status:
                    CallStatus.ANSWERED,

                  attemptNumber:
                    1,

                  maxAttempts:
                    1,

                  requestedAt:
                    now,

                  queuedAt:
                    now,

                  answeredAt:
                    now,

                  startedAt:
                    now,

                  conversation: {
                    create: {},
                  },
                },

                select: {
                  id:
                    true,

                  contactId:
                    true,

                  campaignId:
                    true,
                },
              });

          return call;
        }
      );

    //------------------------------------------------
    // Defensive Session Reset
    //------------------------------------------------

    await IVRMenuSessionService
      .reset(
        result.id
      );

    //------------------------------------------------
    // Log
    //------------------------------------------------

    createCallLogger(
      result.id
    ).info(
      {
        event:
          "inbound.call.created",

        direction:
          CallDirection.INBOUND,

        callerNumber:
          maskPhoneNumber(
            callerNumber
          ),

        calledNumber:
          maskPhoneNumber(
            calledNumber
          ),
      },
      "Inbound call record created"
    );

    return {
      callId:
        result.id,

      contactId:
        result.contactId,

      campaignId:
        result.campaignId,

      created:
        true,
    };
  } catch (
    error
  ) {
    //------------------------------------------------
    // Duplicate Twilio Retry Race
    //------------------------------------------------

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002"
    ) {
      const duplicateCall =
        await prisma.call
          .findUnique({
            where: {
              providerCallId,
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
            },
          });

      if (
        duplicateCall &&
        duplicateCall.direction ===
          CallDirection.INBOUND
      ) {
        return {
          callId:
            duplicateCall.id,

          contactId:
            duplicateCall.contactId,

          campaignId:
            duplicateCall.campaignId,

          created:
            false,
        };
      }
    }

    //------------------------------------------------
    // Failure
    //------------------------------------------------

    serviceLog.error(
      {
        event:
          "inbound.call.create.failed",

        callerNumber:
          maskPhoneNumber(
            callerNumber
          ),

        calledNumber:
          maskPhoneNumber(
            calledNumber
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Inbound call creation failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Normalize Phone Number
//--------------------------------------------------

function normalizePhoneNumber(
  value: string
): string {
  const normalized =
    value
      .trim()
      .replace(
        /[^\d+]/g,
        ""
      );

  /*
   * E.164:
   * - optional leading +
   * - maximum 15 digits
   * - first digit cannot be 0
   */
  if (
    !/^\+?[1-9]\d{0,14}$/.test(
      normalized
    )
  ) {
    return "";
  }

  return normalized;
}

//--------------------------------------------------
// Caller Display Name
//--------------------------------------------------

function buildInboundCallerName(
  phone:
    string
): string {
  const lastFour =
    phone.slice(
      -4
    );

  return lastFour
    ? `Inbound Caller ${lastFour}`
    : "Inbound Caller";
}