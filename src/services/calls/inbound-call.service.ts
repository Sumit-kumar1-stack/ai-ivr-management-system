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

import type {
  CommunicationVoiceRuntime,
} from "@/config/communication-plan";

//--------------------------------------------------
// Constants
//--------------------------------------------------

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
  provider?: string;

  providerCallId:
    string;

  callerNumber:
    string;

  calledNumber:
    string;

  tenantId:
    string;

  inboundProfileId:
    string;

  ivrFlowVersionId?:
    string | null;

  requestedRuntime?: CommunicationVoiceRuntime;

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

  tenantId:
    string;

  inboundProfileId:
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

  const tenantId =
    input.tenantId.trim();

  const inboundProfileId =
    input.inboundProfileId.trim();

  const ivrFlowVersionId =
    input.ivrFlowVersionId?.trim() ||
    null;

  const requestedRuntime =
    input.requestedRuntime ??
    "CASCADED";

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

  if (
    requestedRuntime !== "CASCADED" &&
    requestedRuntime !== "GEMINI_LIVE"
  ) {
    throw new Error("Inbound voice runtime is invalid");
  }

  if (
    !tenantId ||
    !inboundProfileId
  ) {
    throw new Error(
      "Inbound tenant configuration is required"
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

          tenantId:
            true,

          inboundProfileId:
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

    if (
      existingCall.tenantId !== tenantId ||
      existingCall.inboundProfileId !== inboundProfileId
    ) {
      throw new Error(
        "Provider CallSid inbound context does not match the active configuration"
      );
    }

    /*
     * Twilio may retry the webhook.
     * The existing call remains authoritative.
     */
    if (!existingCall.contactId || !existingCall.campaignId) {
      throw new Error("Inbound call is missing its legacy routing context");
    }
    return {
      callId:
        existingCall.id,

      contactId:
        existingCall.contactId,

      campaignId:
        existingCall.campaignId,

      tenantId,

      inboundProfileId,

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
                    buildInboundCampaignSystemKey(
                      tenantId
                    ),
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
                    buildInboundCampaignSystemKey(
                      tenantId
                    ),

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
                  tenantId_phone: {
                    tenantId,

                    phone:
                      callerNumber,
                  },
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

                  tenantId,

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
                  provider:
                    input.provider
                      ?.trim()
                      .toUpperCase() ||
                    "TWILIO",

                  providerCallId,

                  direction:
                    CallDirection.INBOUND,

                  callerNumber,

                  calledNumber,

                  tenantId,

                  inboundProfileId,

                  ivrFlowVersionId,

                  requestedRuntime,

                  effectiveRuntime: null,

                  fallbackUsed: false,

                  fallbackReason: null,

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

        tenantId,

        inboundProfileId,

        requestedRuntime,
      },
      "Inbound call record created"
    );

    if (!result.contactId || !result.campaignId) {
      throw new Error("Inbound call creation did not persist routing context");
    }
    return {
      callId:
        result.id,

      contactId:
        result.contactId,

      campaignId:
        result.campaignId,

      tenantId,

      inboundProfileId,

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

              tenantId:
                true,

              inboundProfileId:
                true,
            },
          });

      if (
        duplicateCall &&
        duplicateCall.direction ===
          CallDirection.INBOUND
      ) {
        if (
          duplicateCall.tenantId !== tenantId ||
          duplicateCall.inboundProfileId !== inboundProfileId
        ) {
          throw new Error(
            "Provider CallSid inbound context does not match the active configuration"
          );
        }

        if (!duplicateCall.contactId || !duplicateCall.campaignId) {
          throw new Error("Inbound duplicate call is missing routing context");
        }
        return {
          callId:
            duplicateCall.id,

          contactId:
            duplicateCall.contactId,

          campaignId:
            duplicateCall.campaignId,

          tenantId,

          inboundProfileId,

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

        tenantId,

        inboundProfileId,

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

function buildInboundCampaignSystemKey(
  tenantId: string
): string {
  return `INBOUND_ENQUIRIES:${tenantId}`;
}
