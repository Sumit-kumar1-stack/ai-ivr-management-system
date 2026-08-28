import {
  ConsentEvidenceAction,
  MessageConsentStatus,
  MessagingChannel,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Decision
//--------------------------------------------------

export interface MessagingConsentDecision {
  allowed:
    boolean;

  status:
    MessageConsentStatus;

  reason:
    string | null;
}

//--------------------------------------------------
// Record Input
//--------------------------------------------------

export interface RecordMessagingConsentInput {
  phone:
    string;

  channel:
    MessagingChannel;

  status:
    "OPTED_IN" |
    "OPTED_OUT";

  source:
    string;

  callId?:
    string;

  requestedBy?:
    string;

  evidenceText?:
    string;

  idempotencyKey?:
    string;

  occurredAt?:
    Date;
}

//--------------------------------------------------
// Record Result
//--------------------------------------------------

export interface RecordMessagingConsentResult {
  phone:
    string;

  channel:
    MessagingChannel;

  status:
    MessageConsentStatus;

  evidenceId:
    string;

  duplicate:
    boolean;
}

//--------------------------------------------------
// Check Consent
//--------------------------------------------------

export async function checkMessagingConsent(
  phone:
    string,

  channel:
    MessagingChannel
): Promise<MessagingConsentDecision> {
  const normalizedPhone =
    normalizePhoneNumber(
      phone
    );

  if (
    !normalizedPhone
  ) {
    return {
      allowed:
        false,

      status:
        MessageConsentStatus.UNKNOWN,

      reason:
        "Recipient phone number is invalid.",
    };
  }

  const consent =
    await prisma
      .messageConsent
      .findUnique({
        where: {
          phone_channel: {
            phone:
              normalizedPhone,

            channel,
          },
        },
      });

  //------------------------------------------------
  // Opted Out
  //------------------------------------------------

  if (
    consent?.status ===
    MessageConsentStatus.OPTED_OUT
  ) {
    return {
      allowed:
        false,

      status:
        consent.status,

      reason:
        "Recipient has opted out of this messaging channel.",
    };
  }

  //------------------------------------------------
  // Opted In
  //------------------------------------------------

  if (
    consent?.status ===
    MessageConsentStatus.OPTED_IN
  ) {
    return {
      allowed:
        true,

      status:
        consent.status,

      reason:
        null,
    };
  }

  //------------------------------------------------
  // Unknown
  //------------------------------------------------

  return {
    allowed:
      false,

    status:
      MessageConsentStatus.UNKNOWN,

    reason:
      "Recipient messaging consent has not been recorded.",
  };
}

//--------------------------------------------------
// Durable Record
//--------------------------------------------------

export async function recordMessagingConsent(
  input:
    RecordMessagingConsentInput
): Promise<RecordMessagingConsentResult> {
  const phone =
    requirePhoneNumber(
      input.phone
    );

  const source =
    input.source
      .trim()
      .slice(
        0,
        200
      );

  if (
    !source
  ) {
    throw new Error(
      "Consent source is required"
    );
  }

  const evidenceText =
    input
      .evidenceText
      ?.trim()
      .slice(
        0,
        1000
      ) ||
    null;

  const idempotencyKey =
    input
      .idempotencyKey
      ?.trim()
      .slice(
        0,
        250
      ) ||
    null;

  const occurredAt =
    input.occurredAt ??
    new Date();

  const resultingStatus =
    input.status ===
      "OPTED_IN"
      ? MessageConsentStatus.OPTED_IN
      : MessageConsentStatus.OPTED_OUT;

  const action =
    input.status ===
      "OPTED_IN"
      ? ConsentEvidenceAction.OPT_IN
      : ConsentEvidenceAction.OPT_OUT;

  //------------------------------------------------
  // Idempotent Replay
  //------------------------------------------------

  if (
    idempotencyKey
  ) {
    const existingEvidence =
      await prisma
        .consentEvidence
        .findUnique({
          where: {
            idempotencyKey,
          },
        });

    if (
      existingEvidence
    ) {
      if (
        existingEvidence.phone !==
          phone ||
        existingEvidence.channel !==
          input.channel
      ) {
        throw new Error(
          "Consent idempotency key belongs to another recipient or channel"
        );
      }

      return {
        phone:
          existingEvidence.phone,

        channel:
          existingEvidence.channel,

        status:
          existingEvidence
            .resultingStatus,

        evidenceId:
          existingEvidence.id,

        duplicate:
          true,
      };
    }
  }

  //------------------------------------------------
  // Current State
  //------------------------------------------------

  const current =
    await prisma
      .messageConsent
      .findUnique({
        where: {
          phone_channel: {
            phone,

            channel:
              input.channel,
          },
        },

        select: {
          status:
            true,
        },
      });

  //------------------------------------------------
  // State + Immutable Evidence
  //------------------------------------------------

  try {
    const result =
      await prisma
        .$transaction(
          async transaction => {
            const now =
              occurredAt;

            await transaction
              .messageConsent
              .upsert({
                where: {
                  phone_channel: {
                    phone,

                    channel:
                      input.channel,
                  },
                },

                create: {
                  phone,

                  channel:
                    input.channel,

                  status:
                    resultingStatus,

                  source,

                  consentedAt:
                    resultingStatus ===
                      MessageConsentStatus.OPTED_IN
                      ? now
                      : null,

                  revokedAt:
                    resultingStatus ===
                      MessageConsentStatus.OPTED_OUT
                      ? now
                      : null,
                },

                update: {
                  status:
                    resultingStatus,

                  source,

                  consentedAt:
                    resultingStatus ===
                      MessageConsentStatus.OPTED_IN
                      ? now
                      : undefined,

                  revokedAt:
                    resultingStatus ===
                      MessageConsentStatus.OPTED_OUT
                      ? now
                      : null,
                },
              });

            const evidence =
              await transaction
                .consentEvidence
                .create({
                  data: {
                    phone,

                    channel:
                      input.channel,

                    action,

                    source,

                    callId:
                      input.callId
                        ?.trim() ||
                      null,

                    requestedBy:
                      input
                        .requestedBy
                        ?.trim() ||
                      null,

                    evidenceText,

                    previousStatus:
                      current?.status ??
                      MessageConsentStatus.UNKNOWN,

                    resultingStatus,

                    idempotencyKey,

                    occurredAt:
                      now,
                  },
                });

            return evidence;
          }
        );

    return {
      phone,

      channel:
        input.channel,

      status:
        resultingStatus,

      evidenceId:
        result.id,

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
      idempotencyKey &&
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002"
    ) {
      const duplicate =
        await prisma
          .consentEvidence
          .findUnique({
            where: {
              idempotencyKey,
            },
          });

      if (
        duplicate
      ) {
        return {
          phone:
            duplicate.phone,

          channel:
            duplicate.channel,

          status:
            duplicate.resultingStatus,

          evidenceId:
            duplicate.id,

          duplicate:
            true,
        };
      }
    }

    throw error;
  }
}

//--------------------------------------------------
// Compatibility: Opt In
//--------------------------------------------------

export async function recordMessagingOptIn(
  phone:
    string,

  channel:
    MessagingChannel,

  source:
    string,

  idempotencyKey?:
    string
): Promise<void> {
  await recordMessagingConsent({
    phone,

    channel,

    status:
      "OPTED_IN",

    source,

    requestedBy:
      "SYSTEM",

    idempotencyKey,
  });
}

//--------------------------------------------------
// Compatibility: Opt Out
//--------------------------------------------------

export async function recordMessagingOptOut(
  phone:
    string,

  channel:
    MessagingChannel,

  source:
    string,

  idempotencyKey?:
    string
): Promise<void> {
  await recordMessagingConsent({
    phone,

    channel,

    status:
      "OPTED_OUT",

    source,

    requestedBy:
      "SYSTEM",

    idempotencyKey,
  });
}

//--------------------------------------------------
// Export Normalizer
//--------------------------------------------------

export function normalizeMessagingPhoneNumber(
  phone:
    string
): string | null {
  return normalizePhoneNumber(
    phone
  );
}

//--------------------------------------------------
// Required Phone
//--------------------------------------------------

function requirePhoneNumber(
  phone:
    string
): string {
  const normalized =
    normalizePhoneNumber(
      phone
    );

  if (
    !normalized
  ) {
    throw new Error(
      "Messaging phone number is invalid"
    );
  }

  return normalized;
}

//--------------------------------------------------
// Normalize Phone
//--------------------------------------------------

function normalizePhoneNumber(
  phone:
    string
): string | null {
  const normalized =
    phone
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  if (
    !/^\+[1-9]\d{7,14}$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}