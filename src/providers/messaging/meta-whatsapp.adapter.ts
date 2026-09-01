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
    "meta-whatsapp-adapter"
  );

//--------------------------------------------------
// Meta Response
//--------------------------------------------------

interface MetaWhatsAppResponse {
  messaging_product?:
    string;

  contacts?:
    Array<{
      input?:
        string;

      wa_id?:
        string;
    }>;

  messages?:
    Array<{
      id?:
        string;
    }>;

  error?: {
    message?:
      string;

    type?:
      string;

    code?:
      number;

    error_subcode?:
      number;
  };
}

//--------------------------------------------------
// Adapter
//--------------------------------------------------

export class MetaWhatsAppAdapter
  implements MessagingProviderAdapter
{
  readonly provider =
    "META" as const;

  readonly channels =
    [
      "WHATSAPP",
    ] as const;

  readonly capabilities =
    [
      "WHATSAPP_OUTBOUND",
      "WHATSAPP_TEMPLATE",
      "WHATSAPP_STATUS_CALLBACK",
      "WHATSAPP_READ_RECEIPT",
    ] as const;

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
    return Boolean(
      getAccessToken() &&
      getPhoneNumberId() &&
      getGraphVersion()
    );
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
      "WHATSAPP"
    ) {
      return {
        success:
          false,

        provider:
          "META",

        channel:
          request.channel,

        code:
          "CHANNEL_NOT_SUPPORTED",

        message:
          "Meta WhatsApp adapter only supports WhatsApp.",
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
          "META",

        channel:
          "WHATSAPP",

        code:
          "MESSAGE_ABORTED",

        message:
          "WhatsApp sending was cancelled.",
      };
    }

    //------------------------------------------------
    // Validate Template
    //------------------------------------------------

    const templateName =
      request.templateName
        ?.trim();

    const templateLanguage =
      request.templateLanguage
        ?.trim();

    if (
      !templateName ||
      !templateLanguage
    ) {
      return {
        success:
          false,

        provider:
          "META",

        channel:
          "WHATSAPP",

        code:
          "WHATSAPP_TEMPLATE_REQUIRED",

        message:
          "Approved WhatsApp template name and language are required.",
      };
    }

    //------------------------------------------------
    // Configuration
    //------------------------------------------------

    const accessToken =
      getAccessToken();

    const phoneNumberId =
      getPhoneNumberId();

    const graphVersion =
      getGraphVersion();

    if (
      !accessToken ||
      !phoneNumberId
    ) {
      return {
        success:
          false,

        provider:
          "META",

        channel:
          "WHATSAPP",

        code:
          "META_WHATSAPP_NOT_CONFIGURED",

        message:
          "Meta WhatsApp configuration is incomplete.",
      };
    }

    //------------------------------------------------
    // Request Body
    //------------------------------------------------

    const payload = {
      messaging_product:
        "whatsapp",

      to:
        normalizeWhatsAppRecipient(
          request.recipient
        ),

      type:
        "template",

      template: {
        name:
          templateName,

        language: {
          code:
            templateLanguage,
        },

        ...(request.templateComponents &&
        request.templateComponents.length >
          0
          ? {
              components:
                request.templateComponents,
            }
          : {}),
      },
    };

    //------------------------------------------------
    // API Request
    //------------------------------------------------

    try {
      const response =
        await fetch(
          `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(
            phoneNumberId
          )}/messages`,
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${accessToken}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              request.signal,
          }
        );

      const raw =
        await response.text();

      let data:
        MetaWhatsAppResponse =
          {};

      try {
        data =
          raw
            ? JSON.parse(
                raw
              )
            : {};
      } catch {
        data =
          {};
      }

      //------------------------------------------------
      // HTTP Failure
      //------------------------------------------------

      if (
        !response.ok
      ) {
        log.error(
          {
            event:
              "meta.whatsapp.http_failed",

            status:
              response.status,

            metaCode:
              data.error
                ?.code,

            metaType:
              data.error
                ?.type,

            recipientMasked:
              maskPhone(
                request.recipient
              ),
          },
          "Meta WhatsApp API rejected request"
        );

        return {
          success:
            false,

          provider:
            "META",

          channel:
            "WHATSAPP",

          code:
            data.error
              ?.code
              ? `META_${data.error.code}`
              : "META_WHATSAPP_FAILED",

          message:
            data.error
              ?.message ||
            "Meta WhatsApp API rejected the message.",
        };
      }

      //------------------------------------------------
      // Message ID
      //------------------------------------------------

      const providerMessageId =
        data.messages?.[0]
          ?.id
          ?.trim();

      if (
        !providerMessageId
      ) {
        return {
          success:
            false,

          provider:
            "META",

          channel:
            "WHATSAPP",

          code:
            "META_MESSAGE_ID_MISSING",

          message:
            "Meta accepted the request but did not return a message identifier.",
        };
      }

      log.info(
        {
          event:
            "meta.whatsapp.accepted",

          providerMessageId,

          recipientMasked:
            maskPhone(
              request.recipient
            ),

          template:
            templateName,
        },
        "Meta accepted WhatsApp template message"
      );

      return {
        success:
          true,

        provider:
          "META",

        channel:
          "WHATSAPP",

        providerMessageId,

        status:
          "accepted",
      };
    } catch (
      error
    ) {
      if (
        request.signal
          ?.aborted
      ) {
        return {
          success:
            false,

          provider:
            "META",

          channel:
            "WHATSAPP",

          code:
            "MESSAGE_ABORTED",

          message:
            "WhatsApp sending was cancelled.",
        };
      }

      log.error(
        {
          event:
            "meta.whatsapp.failed",

          recipientMasked:
            maskPhone(
              request.recipient
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Meta WhatsApp request failed"
      );

      return {
        success:
          false,

        provider:
          "META",

        channel:
          "WHATSAPP",

        code:
          "META_WHATSAPP_FAILED",

        message:
          "Meta WhatsApp request failed.",
      };
    }
  }
}

//--------------------------------------------------
// Access Token
//--------------------------------------------------

function getAccessToken():
  string {
  return (
    process.env
      .META_WHATSAPP_ACCESS_TOKEN
      ?.trim() ||
    ""
  );
}

//--------------------------------------------------
// Phone Number ID
//--------------------------------------------------

function getPhoneNumberId():
  string {
  return (
    process.env
      .META_WHATSAPP_PHONE_NUMBER_ID
      ?.trim() ||
    ""
  );
}

//--------------------------------------------------
// Graph Version
//--------------------------------------------------

function getGraphVersion():
  string {
  return (
    process.env
      .META_GRAPH_API_VERSION
      ?.trim() ||
    "v23.0"
  );
}

//--------------------------------------------------
// Recipient
//--------------------------------------------------

function normalizeWhatsAppRecipient(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /[\s()+-]/g,
      ""
    );
}

//--------------------------------------------------
// Mask
//--------------------------------------------------

function maskPhone(
  phone:
    string
): string {
  const normalized =
    phone.trim();

  if (
    normalized.length <=
    4
  ) {
    return "****";
  }

  return `${"*".repeat(
    Math.max(
      0,
      normalized.length -
        4
    )
  )}${normalized.slice(-4)}`;
}