import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  MessagingChannel,
  MessagingProviderAdapter,
  MessagingProviderCapability,
  MessagingProviderName,
  MessagingSendRequest,
  MessagingSendResult,
} from "@/services/messaging/messaging.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "exotel-sms-adapter"
  );

//--------------------------------------------------
// Exotel SMS Config
//--------------------------------------------------

export interface ExotelSmsConfig {
  accountSid:
    string;

  apiKey:
    string;

  apiToken:
    string;

  subdomain:
    string;

  fromNumber:
    string;
}

export function getExotelSmsConfig(): ExotelSmsConfig {
  const accountSid =
    process.env
      .EXOTEL_ACCOUNT_SID
      ?.trim() ??
    "";

  const apiKey =
    process.env
      .EXOTEL_API_KEY
      ?.trim() ??
    "";

  const apiToken =
    process.env
      .EXOTEL_API_TOKEN
      ?.trim() ??
    "";

  const rawSubdomain =
    process.env
      .EXOTEL_SUBDOMAIN
      ?.trim() ??
    "";

  const subdomain =
    rawSubdomain
      .replace(
        /^https?:\/\//i,
        ""
      )
      .replace(
        /\/+$/,
        ""
      ) ||
    (accountSid
      ? "api.exotel.com"
      : "");

  const fromNumber =
    process.env
      .EXOTEL_SMS_FROM
      ?.trim() ??
    "";

  return {
    accountSid,
    apiKey,
    apiToken,
    subdomain,
    fromNumber,
  };
}

//--------------------------------------------------
// Exotel SMS Adapter
//--------------------------------------------------

export class ExotelSmsAdapter
  implements
    MessagingProviderAdapter
{
  readonly provider: MessagingProviderName =
    "EXOTEL";

  readonly channels = [
    "SMS",
  ] as const;

  readonly capabilities = [
    "SMS_OUTBOUND",
    "SMS_STATUS_CALLBACK",
  ] as const;

  readonly statusCallbackPath =
    "/api/exotel/messaging/status";

  //------------------------------------------------
  // Supports Check
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
      !capability
    ) {
      return true;
    }

    return (
      this
        .capabilities as readonly string[]
    ).includes(
      capability
    );
  }

  //------------------------------------------------
  // Configuration Check
  //------------------------------------------------

  isConfigured(): boolean {
    const config =
      getExotelSmsConfig();

    return Boolean(
      config.accountSid &&
        config.apiKey &&
        config.apiToken &&
        config.subdomain &&
        config.fromNumber
    );
  }

  //------------------------------------------------
  // Send SMS
  //------------------------------------------------

  async send(
    request:
      MessagingSendRequest
  ): Promise<MessagingSendResult> {
    const startedAt =
      Date.now();

    if (
      request.channel !==
      "SMS"
    ) {
      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          request.channel,

        code:
          "INVALID_CHANNEL",

        message:
          `ExotelSmsAdapter does not support channel ${request.channel}`,

        retryable:
          false,
      };
    }

    if (
      request.signal
        ?.aborted
    ) {
      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          "SMS",

        code:
          "MESSAGE_ABORTED",

        message:
          "SMS dispatch was cancelled before execution.",

        retryable:
          false,
      };
    }

    if (
      !this.isConfigured()
    ) {
      log.warn(
        {
          event:
            "exotel.sms.not_configured",

          channel:
            "SMS",
        },
        "Exotel SMS adapter is not configured"
      );

      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          "SMS",

        code:
          "EXOTEL_SMS_NOT_CONFIGURED",

        message:
          "Exotel SMS credentials (EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SUBDOMAIN, EXOTEL_SMS_FROM) are not configured.",

        retryable:
          false,
      };
    }

    const config =
      getExotelSmsConfig();

    const normalizedRecipient =
      normalizeExotelRecipient(
        request.recipient
      );

    if (
      !normalizedRecipient
    ) {
      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          "SMS",

        code:
          "INVALID_PHONE_NUMBER",

        message:
          "Invalid recipient phone number for Exotel SMS.",

        retryable:
          false,
      };
    }

    const body =
      request.body
        ?.trim() ||
      "";

    if (
      !body
    ) {
      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          "SMS",

        code:
          "EMPTY_MESSAGE_BODY",

        message:
          "SMS message body cannot be empty.",

        retryable:
          false,
      };
    }

    const recipientMasked =
      maskPhoneNumber(
        normalizedRecipient
      );

    log.info(
      {
        event:
          "exotel.sms.send_initiated",

        recipientMasked,

        hasStatusCallback:
          Boolean(
            request.statusCallbackUrl
          ),
      },
      "Sending SMS via Exotel REST API"
    );

    try {
      const endpoint =
        `https://${config.subdomain}/v1/Accounts/${encodeURIComponent(
          config.accountSid
        )}/Sms/send.json`;

      const formData =
        new URLSearchParams();

      formData.set(
        "From",
        config.fromNumber
      );

      formData.set(
        "To",
        normalizedRecipient
      );

      formData.set(
        "Body",
        body
      );

      if (
        request.statusCallbackUrl
      ) {
        formData.set(
          "StatusCallback",
          request.statusCallbackUrl
        );
      }

      const authHeader =
        `Basic ${Buffer.from(
          `${config.apiKey}:${config.apiToken}`
        ).toString(
          "base64"
        )}`;

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              Authorization:
                authHeader,

              "Content-Type":
                "application/x-www-form-urlencoded",

              Accept:
                "application/json",
            },

            body:
              formData,

            signal:
              request.signal,
          }
        );

      let payload: any =
        {};

      try {
        payload =
          await response.json();
      } catch {
        payload =
          {};
      }

      if (
        !response.ok
      ) {
        const errorMessage =
          payload
            ?.RestException
            ?.Message ||
          payload
            ?.message ||
          payload
            ?.RestException
            ?.message ||
          `Exotel API returned HTTP ${response.status}`;

        const errorCode =
          payload
            ?.RestException
            ?.Status ||
          "EXOTEL_SMS_FAILED";

        log.error(
          {
            event:
              "exotel.sms.api_error",

            status:
              response.status,

            errorCode,

            errorMessage,

            recipientMasked,

            durationMs:
              Date.now() -
              startedAt,
          },
          "Exotel SMS dispatch failed"
        );

        return {
          success:
            false,

          provider:
            this
              .provider,

        channel:
          "SMS",

        code:
          "EXOTEL_SMS_FAILED",

        message:
          String(
            errorMessage
          ),

        retryable:
          response.status >=
            500 ||
          response.status ===
            429,
        };
      }

      const messageObj =
        payload?.SMSMessage ??
        payload?.SmsMessage ??
        payload?.sms_message ??
        payload;

      const providerMessageId =
        (
          messageObj?.Sid ??
          messageObj?.sid ??
          payload?.Sid ??
          payload?.sid ??
          ""
        ).toString().trim();

      if (
        !providerMessageId
      ) {
        log.error(
          {
            event:
              "exotel.sms.missing_sid",

            recipientMasked,

            payloadKeys:
              Object.keys(
                payload ||
                  {}
              ),
          },
          "Exotel SMS response missing Message Sid"
        );

        return {
          success:
            false,

          provider:
            this
              .provider,

          channel:
            "SMS",

          code:
            "EXOTEL_MESSAGE_SID_MISSING",

          message:
            "Exotel SMS response did not include a valid message SID.",

          retryable:
            false,
        };
      }

      const initialStatus =
        normalizeExotelInitialStatus(
          messageObj?.Status ??
            messageObj?.status ??
            "queued"
        );

      log.info(
        {
          event:
            "exotel.sms.sent",

          providerMessageId,

          recipientMasked,

          status:
            initialStatus,

          durationMs:
            Date.now() -
            startedAt,
        },
        "Exotel SMS sent successfully"
      );

      return {
        success:
          true,

        provider:
          this
            .provider,

        channel:
          "SMS",

        providerMessageId,

        status:
          initialStatus,
      };
    } catch (
      error: any
    ) {
      if (
        error?.name ===
          "AbortError" ||
        request.signal
          ?.aborted
      ) {
        return {
          success:
            false,

          provider:
            this
              .provider,

          channel:
            "SMS",

          code:
            "MESSAGE_ABORTED",

          message:
            "SMS dispatch was cancelled during transmission.",

          retryable:
            false,
        };
      }

      log.error(
        {
          event:
            "exotel.sms.network_error",

          recipientMasked,

          error:
            normalizeError(
              error
            ),

          durationMs:
            Date.now() -
            startedAt,
        },
        "Exotel SMS network exception"
      );

      return {
        success:
          false,

        provider:
          this
            .provider,

        channel:
          "SMS",

        code:
          "EXOTEL_SMS_FAILED",

        message:
          error?.message ||
          "Exotel SMS dispatch failed due to network error",

        retryable:
          true,
      };
    }
  }
}

//--------------------------------------------------
// Helpers
//--------------------------------------------------

function normalizeExotelInitialStatus(
  status: unknown
): string {
  if (
    typeof status !==
    "string"
  ) {
    return "queued";
  }

  const s =
    status
      .trim()
      .toLowerCase();

  if (
    s === "queued" ||
    s === "sending" ||
    s === "submitted"
  ) {
    return "queued";
  }

  if (
    s === "sent"
  ) {
    return "sent";
  }

  if (
    s === "delivered"
  ) {
    return "delivered";
  }

  return "queued";
}

function normalizeExotelRecipient(
  recipient: string
): string | null {
  const cleaned =
    recipient
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  if (
    /^\+[1-9]\d{7,14}$/.test(
      cleaned
    )
  ) {
    return cleaned;
  }

  if (
    /^\d{10}$/.test(
      cleaned
    )
  ) {
    return `+91${cleaned}`;
  }

  if (
    /^91\d{10}$/.test(
      cleaned
    )
  ) {
    return `+${cleaned}`;
  }

  if (
    /^0\d{10}$/.test(
      cleaned
    )
  ) {
    return `+91${cleaned.slice(
      1
    )}`;
  }

  return null;
}

function maskPhoneNumber(
  phone: string
): string {
  if (
    phone.length <
    6
  ) {
    return "***";
  }

  return `${phone.slice(
    0,
    4
  )}****${phone.slice(
    -4
  )}`;
}
