import {
  Client as PlivoClient,
} from "plivo";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  normalizeMessagingPhoneNumber,
} from "@/services/messaging/messaging-consent.service";

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
    "plivo-sms-adapter"
  );

//--------------------------------------------------
// Environment Config Helper
//--------------------------------------------------

export interface PlivoSmsConfig {
  authId:
    string;

  authToken:
    string;

  fromNumber:
    string;
}

export function getPlivoSmsConfig(): PlivoSmsConfig {
  const authId =
    process.env
      .PLIVO_AUTH_ID
      ?.trim() ??
    "";

  const authToken =
    process.env
      .PLIVO_AUTH_TOKEN
      ?.trim() ??
    "";

  const fromNumber =
    process.env
      .PLIVO_SMS_FROM
      ?.trim() ??
    "";

  return {
    authId,
    authToken,
    fromNumber,
  };
}

//--------------------------------------------------
// Plivo SMS Adapter
//--------------------------------------------------

export class PlivoSmsAdapter
  implements MessagingProviderAdapter
{
  readonly provider: MessagingProviderName =
    "PLIVO";

  readonly channels = [
    "SMS",
  ] as const;

  readonly capabilities = [
    "SMS_OUTBOUND",
    "SMS_STATUS_CALLBACK",
  ] as const;

  readonly statusCallbackPath =
    "/api/plivo/messaging/status";

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
  // Configuration Check
  //------------------------------------------------

  isConfigured(): boolean {
    const config =
      getPlivoSmsConfig();

    return Boolean(
      config.authId &&
      config.authToken &&
      config.fromNumber
    );
  }

  //------------------------------------------------
  // Send Dispatch
  //------------------------------------------------

  async send(
    request:
      MessagingSendRequest
  ): Promise<MessagingSendResult> {
    //----------------------------------------------
    // Channel Support Check
    //----------------------------------------------

    if (
      request.channel !==
      "SMS"
    ) {
      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          request.channel,

        code:
          "CHANNEL_NOT_SUPPORTED",

        message:
          `PlivoSmsAdapter does not support channel ${request.channel}`,
      };
    }

    //----------------------------------------------
    // Abort Signal Check
    //----------------------------------------------

    if (
      request.signal?.aborted
    ) {
      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          "SMS",

        code:
          "MESSAGE_ABORTED",

        message:
          "SMS dispatch was aborted before reaching Plivo.",
      };
    }

    //----------------------------------------------
    // Configuration Validation
    //----------------------------------------------

    const config =
      getPlivoSmsConfig();

    if (
      !config.authId ||
      !config.authToken ||
      !config.fromNumber
    ) {
      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          "SMS",

        code:
          "PLIVO_SMS_NOT_CONFIGURED",

        message:
          "Plivo SMS provider credentials (PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_SMS_FROM) are not fully configured.",
      };
    }

    //----------------------------------------------
    // Recipient & Body Validation
    //----------------------------------------------

    const normalizedRecipient =
      normalizeMessagingPhoneNumber(
        request.recipient
      );

    if (
      !normalizedRecipient
    ) {
      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          "SMS",

        code:
          "INVALID_RECIPIENT",

        message:
          "Recipient phone number is invalid.",
      };
    }

    const body =
      request.body?.trim() ||
      "";

    if (
      !body
    ) {
      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          "SMS",

        code:
          "EMPTY_MESSAGE_BODY",

        message:
          "SMS body cannot be empty.",
      };
    }

    //----------------------------------------------
    // Plivo Client Execution
    //----------------------------------------------

    try {
      const client =
        new PlivoClient(
          config.authId,
          config.authToken
        );

      const optionalParams: Record<
        string,
        unknown
      > = {};

      if (
        request.statusCallbackUrl
      ) {
        optionalParams.url =
          request.statusCallbackUrl;
      }

      const response =
        await client.messages.create(
          config.fromNumber,
          normalizedRecipient,
          body,
          optionalParams
        );

      const messageUuid =
        Array.isArray(
          response?.messageUuid
        )
          ? response.messageUuid[0]
          : typeof response?.messageUuid ===
            "string"
            ? response.messageUuid
            : "";

      if (
        !messageUuid
      ) {
        log.error(
          {
            event:
              "plivo.sms.missing_uuid",

            recipientMasked:
              maskPhone(
                normalizedRecipient
              ),
          },
          "Plivo create message succeeded but returned no message UUID"
        );

        return {
          success:
            false,

          provider:
            this.provider,

          channel:
            "SMS",

          code:
            "PLIVO_MESSAGE_UUID_MISSING",

          message:
            "Plivo did not return a message UUID.",
        };
      }

      log.info(
        {
          event:
            "plivo.sms.dispatched",

          providerMessageId:
            messageUuid,

          recipientMasked:
            maskPhone(
              normalizedRecipient
            ),
        },
        "Plivo SMS message dispatched successfully"
      );

      return {
        success:
          true,

        provider:
          this.provider,

        channel:
          "SMS",

        providerMessageId:
          messageUuid,

        status:
          "queued",
      };
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "plivo.sms.dispatch_failed",

          recipientMasked:
            maskPhone(
              normalizedRecipient
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Plivo SMS dispatch failed"
      );

      const errorMessage =
        error instanceof
        Error
          ? error.message
          : String(
              error
            );

      return {
        success:
          false,

        provider:
          this.provider,

        channel:
          "SMS",

        code:
          "PLIVO_SMS_FAILED",

        message:
          errorMessage,
      };
    }
  }
}

//--------------------------------------------------
// Mask Phone Helper
//--------------------------------------------------

function maskPhone(
  phone: string
): string {
  if (
    phone.length <= 4
  ) {
    return "****";
  }

  return `${phone.slice(
    0,
    3
  )}****${phone.slice(
    -4
  )}`;
}
