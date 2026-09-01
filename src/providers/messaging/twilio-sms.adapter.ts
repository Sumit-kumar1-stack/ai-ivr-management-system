import {
  twilioClient,
} from "@/providers/twilio/twilio.client";

import {
  getTwilioConfig,
} from "@/providers/twilio/twilio.config";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  MessagingChannel,
  MessagingProviderAdapter,
  MessagingProviderCapability,
  MessagingSendRequest,
  MessagingSendResult,
} from "@/services/messaging/messaging.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "twilio-sms-adapter"
  );

//--------------------------------------------------
// Adapter
//--------------------------------------------------

export class TwilioSmsAdapter
  implements MessagingProviderAdapter
{
  readonly provider =
    "TWILIO" as const;

  readonly channels =
    [
      "SMS",
    ] as const;

  readonly capabilities =
    [
      "SMS_OUTBOUND",
      "SMS_STATUS_CALLBACK",
    ] as const;

  readonly statusCallbackPath =
    "/api/twilio/messaging/status";

  //------------------------------------------------
  // Supports
  //------------------------------------------------

  supports(
    channel:
      MessagingChannel,
    capability?:
      MessagingProviderCapability
  ): boolean {
    if (
      !(
        this
          .channels as readonly string[]
      ).includes(
        channel
      )
    ) {
      return false;
    }

    if (
      capability &&
      !(
        this
          .capabilities as readonly string[]
      ).includes(
        capability
      )
    ) {
      return false;
    }

    return true;
  }

  //------------------------------------------------
  // Configured
  //------------------------------------------------

  isConfigured():
    boolean {
    try {
      const config =
        getTwilioConfig();

      return Boolean(
        config.accountSid &&
        config.authToken &&
        (
          process.env
            .TWILIO_MESSAGING_SERVICE_SID
            ?.trim() ||
          config.phoneNumber
        )
      );
    } catch {
      return false;
    }
  }

  //------------------------------------------------
  // Send
  //------------------------------------------------

  async send(
    request:
      MessagingSendRequest
  ): Promise<MessagingSendResult> {
    if (
      request.channel !==
      "SMS"
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        channel:
          request.channel,

        code:
          "CHANNEL_NOT_SUPPORTED",

        message:
          "Twilio SMS adapter only supports SMS.",
      };
    }

    //------------------------------------------------
    // Abort
    //------------------------------------------------

    if (
      request.signal?.aborted
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        channel:
          "SMS",

        code:
          "MESSAGE_ABORTED",

        message:
          "SMS sending was cancelled.",
      };
    }

    //------------------------------------------------
    // Configuration
    //------------------------------------------------

    const config =
      getTwilioConfig();

    const messagingServiceSid =
      process.env
        .TWILIO_MESSAGING_SERVICE_SID
        ?.trim();

    //------------------------------------------------
    // Request
    //------------------------------------------------

    try {
      const message =
        await twilioClient
          .messages
          .create({
            to:
              request.recipient,

            body:
              request.body,

            ...(messagingServiceSid
              ? {
                  messagingServiceSid,
                }
              : {
                  from:
                    config.phoneNumber,
                }),

            ...(request.statusCallbackUrl
              ? {
                  statusCallback:
                    request.statusCallbackUrl,
                }
              : {}),
          });

      log.info(
        {
          event:
            "twilio.sms.accepted",

          providerMessageId:
            message.sid,

          status:
            message.status,

          recipientMasked:
            maskPhone(
              request.recipient
            ),
        },
        "Twilio accepted outbound SMS"
      );

      return {
        success:
          true,

        provider:
          "TWILIO",

        channel:
          "SMS",

        providerMessageId:
          message.sid,

        status:
          message.status,
      };
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.sms.failed",

          recipientMasked:
            maskPhone(
              request.recipient
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Twilio SMS request failed"
      );

      return {
        success:
          false,

        provider:
          "TWILIO",

        channel:
          "SMS",

        code:
          "TWILIO_SMS_FAILED",

        message:
          "Twilio could not accept the SMS request.",
      };
    }
  }
}

//--------------------------------------------------
// Mask
//--------------------------------------------------

function maskPhone(
  phone:
    string
): string {
  if (
    phone.length <=
    4
  ) {
    return "****";
  }

  return `${"*".repeat(
    phone.length - 4
  )}${phone.slice(-4)}`;
}