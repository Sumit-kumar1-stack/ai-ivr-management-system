import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  createPlivoAuthErrorResponse,
  validatePlivoWebhook,
} from "@/lib/plivo-webhook-auth";

import {
  updateOutboundMessageStatus,
} from "@/services/messaging/outbound-message-status.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "plivo-message-status"
  );

//--------------------------------------------------
// Status Normalizer
//--------------------------------------------------

export function normalizePlivoMessageStatus(
  status: string
): OutboundMessageStatus {
  switch (
    status
      .trim()
      .toLowerCase()
  ) {
    case "queued":
      return OutboundMessageStatus.QUEUED;

    case "sent":
      return OutboundMessageStatus.SENT;

    case "delivered":
      return OutboundMessageStatus.DELIVERED;

    case "failed":
    case "rejected":
      return OutboundMessageStatus.FAILED;

    case "undelivered":
      return OutboundMessageStatus.UNDELIVERED;

    default:
      return OutboundMessageStatus.ACCEPTED;
  }
}

//--------------------------------------------------
// POST: Plivo SMS Status Callback
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    const params =
      await validatePlivoWebhook(
        request
      );

    const outboundMessageId =
      request.nextUrl
        .searchParams
        .get(
          "messageId"
        )
        ?.trim() ||
      "";

    const rawMessageUuid =
      params.MessageUUID ??
      params.ParentMessageUUID ??
      params.message_uuid ??
      "";

    const providerMessageId =
      (
        Array.isArray(
          rawMessageUuid
        )
          ? rawMessageUuid[0]
          : String(
              rawMessageUuid
            )
      ).trim();

    const rawStatus =
      params.Status ??
      params.MessageStatus ??
      params.status ??
      "";

    const providerStatus =
      (
        Array.isArray(
          rawStatus
        )
          ? rawStatus[0]
          : String(
              rawStatus
            )
      ).trim();

    const rawErrorCode =
      params.ErrorCode ??
      params.error_code ??
      "";

    const errorCode =
      (
        Array.isArray(
          rawErrorCode
        )
          ? rawErrorCode[0]
          : String(
              rawErrorCode
            )
      ).trim();

    if (
      !outboundMessageId &&
      !providerMessageId
    ) {
      return new NextResponse(
        "Bad Request",
        {
          status:
            400,
        }
      );
    }

    //----------------------------------------------
    // Message Ownership Verification
    //----------------------------------------------

    let targetOutboundMessageId =
      outboundMessageId;

    if (
      outboundMessageId
    ) {
      const current =
        await prisma
          .outboundMessage
          .findUnique({
            where: {
              id:
                outboundMessageId,
            },

            select: {
              id:
                true,

              providerMessageId:
                true,
            },
          });

      if (
        !current
      ) {
        return new NextResponse(
          "Not Found",
          {
            status:
              404,
          }
        );
      }

      // UUID cannot belong to another local message
      if (
        providerMessageId
      ) {
        const uuidOwner =
          await prisma
            .outboundMessage
            .findUnique({
              where: {
                providerMessageId,
              },

              select: {
                id:
                  true,
              },
            });

        if (
          uuidOwner &&
          uuidOwner.id !==
            outboundMessageId
        ) {
          log.warn(
            {
              event:
                "plivo.sms.status_uuid_owned_elsewhere",

              outboundMessageId,

              providerMessageId,

              uuidOwnerId:
                uuidOwner.id,
            },
            "Plivo SMS status callback UUID belongs to another outbound message"
          );

          return new NextResponse(
            "Forbidden",
            {
              status:
                403,
            }
          );
        }

        // Existing UUID must match if already set
        if (
          current.providerMessageId &&
          current.providerMessageId !==
            providerMessageId
        ) {
          log.warn(
            {
              event:
                "plivo.sms.status_uuid_mismatch",

              outboundMessageId,

              providerMessageId,

              existingProviderMessageId:
                current.providerMessageId,
            },
            "Plivo SMS status callback UUID mismatch"
          );

          return new NextResponse(
            "Forbidden",
            {
              status:
                403,
            }
          );
        }

        // Bind UUID if callback arrives before return
        if (
          !current.providerMessageId
        ) {
          try {
            await prisma
              .outboundMessage
              .updateMany({
                where: {
                  id:
                    outboundMessageId,

                  providerMessageId:
                    null,
                },

                data: {
                  providerMessageId,
                },
              });
          } catch (
            error
          ) {
            if (
              error instanceof
                Prisma.PrismaClientKnownRequestError &&
              error.code ===
                "P2002"
            ) {
              return new NextResponse(
                "Forbidden",
                {
                  status:
                    403,
                }
              );
            }

            throw error;
          }
        }
      }
    } else {
      // Lookup by providerMessageId directly
      const current =
        await prisma
          .outboundMessage
          .findUnique({
            where: {
              providerMessageId,
            },

            select: {
              id:
                true,
            },
          });

      if (
        !current
      ) {
        log.warn(
          {
            event:
              "plivo.sms.status_message_not_found",

            providerMessageId,
          },
          "Plivo SMS status callback message not found by providerMessageId"
        );

        return new NextResponse(
          "Not Found",
          {
            status:
              404,
          }
        );
      }

      targetOutboundMessageId =
        current.id;
    }

    //----------------------------------------------
    // Monotonic Status Transition
    //----------------------------------------------

    const mappedStatus =
      normalizePlivoMessageStatus(
        providerStatus
      );

    const lookupId =
      providerMessageId ||
      targetOutboundMessageId;

    const result =
      await updateOutboundMessageStatus({
        providerMessageId:
          lookupId,

        status:
          mappedStatus,

        occurredAt:
          new Date(),

        errorCode:
          errorCode ||
          undefined,

        errorMessage:
          mappedStatus ===
            OutboundMessageStatus.FAILED ||
          mappedStatus ===
            OutboundMessageStatus.UNDELIVERED
            ? `Plivo message status: ${providerStatus}`
            : undefined,
      });

    if (
      !result.found
    ) {
      log.warn(
        {
          event:
            "plivo.sms.status_unknown_message",

          outboundMessageId:
            targetOutboundMessageId,

          providerMessageId,
        },
        "Plivo SMS status callback could not resolve the outbound message record"
      );

      return new NextResponse(
        "Not Found",
        {
          status:
            404,
        }
      );
    }

    log.info(
      {
        event:
          "plivo.sms.status_processed",

        outboundMessageId:
          result.outboundMessageId,

        providerMessageId,

        providerStatus,

        mappedStatus,

        updated:
          result.updated,

        previousStatus:
          result.previousStatus,

        currentStatus:
          result.currentStatus,
      },
      "Plivo SMS status callback processed"
    );

    return NextResponse.json({
      success:
        true,

      matched:
        result.found,

      updated:
        result.updated,

      status:
        result.currentStatus ??
        mappedStatus,
    });
  } catch (
    error
  ) {
    const authResponse =
      createPlivoAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    log.error(
      {
        event:
          "plivo.sms.status_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Plivo SMS status callback processing failed"
    );

    return new NextResponse(
      "Internal Server Error",
      {
        status:
          500,
      }
    );
  }
}
