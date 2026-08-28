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
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

import {
  updateOutboundMessageStatus,
} from "@/services/messaging/outbound-message-status.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "twilio-message-status"
  );

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    const {
      params,
    } =
      await validateTwilioWebhook(
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

    const providerMessageId =
      String(
        params.MessageSid ??
        ""
      ).trim();

    const providerStatus =
      String(
        params.MessageStatus ??
        ""
      )
        .trim()
        .toLowerCase();

    const errorCode =
      String(
        params.ErrorCode ??
        ""
      ).trim();

    if (
      !outboundMessageId ||
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

    //------------------------------------------------
    // Message Ownership
    //------------------------------------------------

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

    //------------------------------------------------
    // SID Cannot Belong To Another Local Message
    //------------------------------------------------

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
            "twilio.sms.status_sid_owned_elsewhere",

          outboundMessageId,

          providerMessageId,

          sidOwnerId:
            sidOwner.id,
        },
        "SMS status callback SID belongs to another outbound message"
      );

      return new NextResponse(
        "Forbidden",
        {
          status:
            403,
        }
      );
    }

    //------------------------------------------------
    // Existing SID Must Match
    //------------------------------------------------

    if (
      current.providerMessageId &&
      current.providerMessageId !==
        providerMessageId
    ) {
      log.warn(
        {
          event:
            "twilio.sms.status_sid_mismatch",

          outboundMessageId,

          providerMessageId,
        },
        "SMS status callback SID mismatch"
      );

      return new NextResponse(
        "Forbidden",
        {
          status:
            403,
        }
      );
    }

    //------------------------------------------------
    // Bind SID If Provider Callback Wins The Race
    //------------------------------------------------

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

    //------------------------------------------------
    // Forward-Only Durable Status Transition
    //------------------------------------------------

    const mappedStatus =
      mapStatus(
        providerStatus
      );

    const result =
      await updateOutboundMessageStatus({
        providerMessageId,

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
            ? `Twilio message status: ${providerStatus}`
            : undefined,
      });

    if (
      !result.found
    ) {
      log.warn(
        {
          event:
            "twilio.sms.status_unknown_message",

          outboundMessageId,

          providerMessageId,
        },
        "SMS status callback could not resolve the outbound message"
      );

      return new NextResponse(
        "Not Found",
        {
          status:
            404,
        }
      );
    }

    //------------------------------------------------
    // Duplicate / Regression
    //------------------------------------------------

    if (
      !result.updated
    ) {
      log.debug(
        {
          event:
            "twilio.sms.status_ignored",

          outboundMessageId:
            result
              .outboundMessageId,

          providerMessageId,

          providerStatus,

          mappedStatus,

          currentStatus:
            result
              .currentStatus,
        },
        "SMS status callback was duplicate or out of order"
      );

      return new NextResponse(
        "OK",
        {
          status:
            200,
        }
      );
    }

    //------------------------------------------------
    // Applied
    //------------------------------------------------

    log.info(
      {
        event:
          "twilio.sms.status_updated",

        outboundMessageId:
          result
            .outboundMessageId,

        providerMessageId,

        providerStatus,

        previousStatus:
          result
            .previousStatus,

        currentStatus:
          result
            .currentStatus,
      },
      "Twilio SMS status updated"
    );

    return new NextResponse(
      "OK",
      {
        status:
          200,
      }
    );
  } catch (
    error
  ) {
    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse as
        NextResponse;
    }

    log.error(
      {
        event:
          "twilio.sms.status_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Twilio SMS status callback failed"
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

//--------------------------------------------------
// Status Mapping
//--------------------------------------------------

function mapStatus(
  value:
    string
): OutboundMessageStatus {
  switch (
    value
  ) {
    case "queued":
      return OutboundMessageStatus.QUEUED;

    case "sending":
    case "sent":
      return OutboundMessageStatus.SENT;

    case "delivered":
      return OutboundMessageStatus.DELIVERED;

    case "failed":
      return OutboundMessageStatus.FAILED;

    case "undelivered":
      return OutboundMessageStatus.UNDELIVERED;

    default:
      return OutboundMessageStatus.ACCEPTED;
  }
}