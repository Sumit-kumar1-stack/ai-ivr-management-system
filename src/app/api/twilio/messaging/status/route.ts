import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  OutboundMessageStatus,
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

    const current =
      await prisma
        .outboundMessage
        .findUnique({
          where: {
            id:
              outboundMessageId,
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
    // SID Ownership Guard
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

    const mappedStatus =
      mapStatus(
        providerStatus
      );

    const now =
      new Date();

    await prisma
      .outboundMessage
      .update({
        where: {
          id:
            outboundMessageId,
        },

        data: {
          providerMessageId,

          status:
            mappedStatus,

          ...(mappedStatus ===
          OutboundMessageStatus.SENT
            ? {
                sentAt:
                  now,
              }
            : {}),

          ...(mappedStatus ===
          OutboundMessageStatus.DELIVERED
            ? {
                deliveredAt:
                  now,
              }
            : {}),

          ...(mappedStatus ===
            OutboundMessageStatus.FAILED ||
          mappedStatus ===
            OutboundMessageStatus.UNDELIVERED
            ? {
                failedAt:
                  now,

                errorCode:
                  errorCode ||
                  providerStatus,

                errorMessage:
                  `Twilio message status: ${providerStatus}`,
              }
            : {}),
        },
      });

    log.info(
      {
        event:
          "twilio.sms.status_updated",

        outboundMessageId,

        providerStatus,

        mappedStatus,
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