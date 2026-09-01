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
  createExotelAuthErrorResponse,
  validateExotelSmsStatusWebhook,
} from "@/lib/exotel-webhook-auth";

import {
  updateOutboundMessageStatus,
} from "@/services/messaging/outbound-message-status.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "exotel-message-status"
  );

//--------------------------------------------------
// Status Normalizer
//--------------------------------------------------

export function normalizeExotelMessageStatus(
  status: string
): OutboundMessageStatus {
  switch (
    status
      .trim()
      .toLowerCase()
  ) {
    case "queued":
    case "sending":
    case "submitted":
      return OutboundMessageStatus.QUEUED;

    case "sent":
      return OutboundMessageStatus.SENT;

    case "delivered":
      return OutboundMessageStatus.DELIVERED;

    case "failed":
    case "failed-dnd":
    case "rejected":
      return OutboundMessageStatus.FAILED;

    case "undelivered":
      return OutboundMessageStatus.UNDELIVERED;

    default:
      return OutboundMessageStatus.ACCEPTED;
  }
}

//--------------------------------------------------
// POST: Exotel SMS Status Callback
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  return handleExotelStatusCallback(
    request
  );
}

//--------------------------------------------------
// GET: Exotel SMS Status Callback (some Exotel setups issue GET)
//--------------------------------------------------

export async function GET(
  request:
    NextRequest
): Promise<NextResponse> {
  return handleExotelStatusCallback(
    request
  );
}

//--------------------------------------------------
// Handler
//--------------------------------------------------

async function handleExotelStatusCallback(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    const {
      params,
      messageId:
        queryMessageId,
    } =
      await validateExotelSmsStatusWebhook(
        request
      );

    const outboundMessageId =
      queryMessageId ||
      request.nextUrl
        .searchParams
        .get(
          "messageId"
        )
        ?.trim() ||
      "";

    const rawMessageSid =
      params.SmsSid ??
      params.SMSMessageSid ??
      params.Sid ??
      params.MessageSid ??
      params.sms_sid ??
      "";

    const providerMessageId =
      (
        Array.isArray(
          rawMessageSid
        )
          ? rawMessageSid[0]
          : String(
              rawMessageSid
            )
      ).trim();

    const rawStatus =
      params.Status ??
      params.SmsStatus ??
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
      params.DetailedStatus ??
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

              provider:
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

      // Provider must be EXOTEL
      if (
        current.provider &&
        current.provider.toUpperCase() !==
          "EXOTEL"
      ) {
        log.warn(
          {
            event:
              "exotel.sms.status_provider_mismatch",

            outboundMessageId,

            provider:
              current.provider,
          },
          "Exotel SMS status callback rejected: message provider is not EXOTEL"
        );

        return new NextResponse(
          "Forbidden",
          {
            status:
              403,
          }
        );
      }

      // SID cannot belong to another local message
      if (
        providerMessageId
      ) {
        const sidOwner =
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
          sidOwner &&
          sidOwner.id !==
            outboundMessageId
        ) {
          log.warn(
            {
              event:
                "exotel.sms.status_sid_owned_elsewhere",

              outboundMessageId,

              providerMessageId,

              sidOwnerId:
                sidOwner.id,
            },
            "Exotel SMS status callback SID belongs to another outbound message"
          );

          return new NextResponse(
            "Forbidden",
            {
              status:
                403,
            }
          );
        }

        // Existing SID must match if already set
        if (
          current.providerMessageId &&
          current.providerMessageId !==
            providerMessageId
        ) {
          log.warn(
            {
              event:
                "exotel.sms.status_sid_mismatch",

              outboundMessageId,

              providerMessageId,

              existingProviderMessageId:
                current.providerMessageId,
            },
            "Exotel SMS status callback SID mismatch"
          );

          return new NextResponse(
            "Forbidden",
            {
              status:
                403,
            }
          );
        }

        // Bind SID if callback arrives before return
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

              provider:
                true,
            },
          });

      if (
        !current
      ) {
        log.warn(
          {
            event:
              "exotel.sms.status_message_not_found",

            providerMessageId,
          },
          "Exotel SMS status callback message not found by providerMessageId"
        );

        return new NextResponse(
          "Not Found",
          {
            status:
              404,
          }
        );
      }

      // Provider must be EXOTEL
      if (
        current.provider &&
        current.provider.toUpperCase() !==
          "EXOTEL"
      ) {
        log.warn(
          {
            event:
              "exotel.sms.status_provider_mismatch",

            providerMessageId,

            provider:
              current.provider,
          },
          "Exotel SMS status callback rejected: message provider is not EXOTEL"
        );

        return new NextResponse(
          "Forbidden",
          {
            status:
              403,
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
      normalizeExotelMessageStatus(
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
            ? `Exotel message status: ${providerStatus}`
            : undefined,
      });

    if (
      !result.found
    ) {
      log.warn(
        {
          event:
            "exotel.sms.status_unknown_message",

          outboundMessageId:
            targetOutboundMessageId,

          providerMessageId,
        },
        "Exotel SMS status callback could not resolve the outbound message record"
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
          "exotel.sms.status_processed",

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
      "Exotel SMS status callback processed"
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
      createExotelAuthErrorResponse(
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
          "exotel.sms.status_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Exotel SMS status callback processing failed"
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
