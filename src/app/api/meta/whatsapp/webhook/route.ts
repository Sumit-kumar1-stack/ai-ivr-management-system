import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  MessagingChannel,
  OutboundMessageStatus,
} from "@prisma/client";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  recordMessagingOptIn,
  recordMessagingOptOut,
} from "@/services/messaging/messaging-consent.service";

import {
  updateOutboundMessageStatus,
} from "@/services/messaging/outbound-message-status.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "meta-whatsapp-webhook"
  );

//--------------------------------------------------
// GET - Meta Verification
//--------------------------------------------------

export async function GET(
  request:
    NextRequest
): Promise<NextResponse> {
  const mode =
    request.nextUrl
      .searchParams
      .get(
        "hub.mode"
      );

  const token =
    request.nextUrl
      .searchParams
      .get(
        "hub.verify_token"
      );

  const challenge =
    request.nextUrl
      .searchParams
      .get(
        "hub.challenge"
      );

  const expectedToken =
    process.env
      .META_WHATSAPP_VERIFY_TOKEN
      ?.trim();

  if (
    mode ===
      "subscribe" &&
    token &&
    expectedToken &&
    token ===
      expectedToken &&
    challenge
  ) {
    return new NextResponse(
      challenge,
      {
        status:
          200,
      }
    );
  }

  return new NextResponse(
    "Forbidden",
    {
      status:
        403,
    }
  );
}

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    //------------------------------------------------
    // Read Raw Body
    //------------------------------------------------

    const rawBody =
      await request.text();

    //------------------------------------------------
    // Signature Validation
    //------------------------------------------------

    const signature =
      request.headers.get(
        "x-hub-signature-256"
      );

    const validSignature =
      await verifyMetaSignature(
        rawBody,
        signature
      );

    if (
      !validSignature
    ) {
      log.warn(
        {
          event:
            "meta.whatsapp.signature_invalid",
        },
        "Meta WhatsApp webhook signature rejected"
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
    // Parse JSON
    //------------------------------------------------

    const payload =
      JSON.parse(
        rawBody
      ) as MetaWebhookPayload;

    //------------------------------------------------
    // Ignore Non-WhatsApp Payloads
    //------------------------------------------------

    if (
      payload.object &&
      payload.object !==
        "whatsapp_business_account"
    ) {
      log.warn(
        {
          event:
            "meta.whatsapp.unexpected_object",

          object:
            payload.object,
        },
        "Unexpected Meta webhook object"
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
    // Entries
    //------------------------------------------------

    for (
      const entry of
      payload.entry ??
      []
    ) {
      for (
        const change of
        entry.changes ??
        []
      ) {
        //------------------------------------------------
        // Only Messages Webhook
        //------------------------------------------------

        if (
          change.field &&
          change.field !==
            "messages"
        ) {
          continue;
        }

        const value =
          change.value;

        //------------------------------------------------
        // Message Statuses
        //------------------------------------------------

        for (
          const status of
          value.statuses ??
          []
        ) {
          await processStatus(
            status
          );
        }

        //------------------------------------------------
        // Inbound Messages
        //------------------------------------------------

        for (
          const message of
          value.messages ??
          []
        ) {
          await processInboundMessage(
            message
          );
        }
      }
    }

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
    log.error(
      {
        event:
          "meta.whatsapp.webhook_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Meta WhatsApp webhook failed"
    );

    /*
     * Return 500 so Meta can retry transient
     * application failures.
     */
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
// Process Message Status
//--------------------------------------------------

async function processStatus(
  status:
    MetaStatus
): Promise<void> {
  const providerMessageId =
    status.id
      ?.trim();

  if (
    !providerMessageId
  ) {
    return;
  }

  //------------------------------------------------
  // Map Provider Status
  //------------------------------------------------

  const mapped =
    mapMetaStatus(
      status.status
    );

  const providerError =
    status.errors
      ?.[0];

  const occurredAt =
    resolveMetaTimestamp(
      status.timestamp
    ) ??
    new Date();

  //------------------------------------------------
  // Atomic Status Transition
  //------------------------------------------------

  const result =
    await updateOutboundMessageStatus({
      providerMessageId,

      status:
        mapped,

      occurredAt,

      errorCode:
        providerError
          ?.code !==
        undefined
          ? String(
              providerError.code
            )
          : undefined,

      errorMessage:
        providerError
          ?.message
          ?.trim()
          .slice(
            0,
            500
          ) ||
        providerError
          ?.title
          ?.trim()
          .slice(
            0,
            500
          ),
    });

  //------------------------------------------------
  // Unknown Message
  //------------------------------------------------

  if (
    !result.found
  ) {
    log.warn(
      {
        event:
          "meta.whatsapp.status_unknown_message",

        providerMessageId,
      },
      "WhatsApp status received for unknown message"
    );

    return;
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
          "meta.whatsapp.status_ignored",

        outboundMessageId:
          result.outboundMessageId,

        providerMessageId,

        providerStatus:
          status.status,

        mappedStatus:
          mapped,

        currentStatus:
          result.currentStatus,
      },
      "WhatsApp status callback was duplicate or out of order"
    );

    return;
  }

  //------------------------------------------------
  // Applied
  //------------------------------------------------

  log.info(
    {
      event:
        "meta.whatsapp.status_updated",

      outboundMessageId:
        result.outboundMessageId,

      providerMessageId,

      providerStatus:
        status.status,

      previousStatus:
        result.previousStatus,

      mappedStatus:
        result.currentStatus,
    },
    "WhatsApp delivery status updated"
  );
}

//--------------------------------------------------
// Process Inbound Message
//--------------------------------------------------

async function processInboundMessage(
  message:
    MetaInboundMessage
): Promise<void> {
  //------------------------------------------------
  // Provider Message ID
  //------------------------------------------------

  const providerMessageId =
    message.id
      ?.trim();

  //------------------------------------------------
  // Sender
  //------------------------------------------------

  const from =
    normalizeInboundPhone(
      message.from
    );

  if (
    !from
  ) {
    log.warn(
      {
        event:
          "meta.whatsapp.inbound_invalid_sender",

        providerMessageId,
      },
      "Inbound WhatsApp message has invalid sender"
    );

    return;
  }

  //------------------------------------------------
  // Text Messages Only For Consent Commands
  //------------------------------------------------

  if (
    message.type &&
    message.type !==
      "text"
  ) {
    log.info(
      {
        event:
          "meta.whatsapp.inbound_non_text_ignored",

        providerMessageId,

        messageType:
          message.type,
      },
      "Non-text WhatsApp message ignored by consent handler"
    );

    return;
  }

  const text =
    message.text
      ?.body
      ?.trim();

  if (
    !text
  ) {
    return;
  }

  const normalizedText =
    normalizeConsentKeyword(
      text
    );

  //------------------------------------------------
  // Opt-Out
  //------------------------------------------------

  if (
    isOptOutKeyword(
      normalizedText
    )
  ) {
    const consentIdempotencyKey =
      providerMessageId
        ? [
            "meta-whatsapp-consent",
            providerMessageId,
            "opt-out",
          ].join(
            ":"
          )
        : undefined;

    await recordMessagingOptOut(
      from,
      MessagingChannel.WHATSAPP,
      "WHATSAPP_INBOUND_KEYWORD",
      consentIdempotencyKey
    );

    log.info(
      {
        event:
          "meta.whatsapp.opt_out",

        providerMessageId,

        recipientMasked:
          maskPhone(
            from
          ),
      },
      "WhatsApp recipient opted out"
    );

    return;
  }

  //------------------------------------------------
  // Explicit Opt-In
  //------------------------------------------------

  if (
    isOptInKeyword(
      normalizedText
    )
  ) {
    const consentIdempotencyKey =
      providerMessageId
        ? [
            "meta-whatsapp-consent",
            providerMessageId,
            "opt-in",
          ].join(
            ":"
          )
        : undefined;

    await recordMessagingOptIn(
      from,
      MessagingChannel.WHATSAPP,
      "WHATSAPP_INBOUND_KEYWORD",
      consentIdempotencyKey
    );

    log.info(
      {
        event:
          "meta.whatsapp.opt_in",

        providerMessageId,

        recipientMasked:
          maskPhone(
            from
          ),
      },
      "WhatsApp recipient opted in"
    );

    return;
  }

  //------------------------------------------------
  // Other Messages
  //------------------------------------------------

  log.info(
    {
      event:
        "meta.whatsapp.inbound_non_consent_message",

      providerMessageId,

      recipientMasked:
        maskPhone(
          from
        ),

      messageType:
        message.type ??
        "text",
    },
    "Inbound WhatsApp message received but not routed in this phase"
  );

  /*
   * Full inbound WhatsApp conversational routing is
   * intentionally not performed here yet.
   *
   * This webhook currently owns:
   *
   * - delivery lifecycle updates
   * - explicit WhatsApp opt-in
   * - explicit WhatsApp opt-out
   *
   * Normal customer conversations should later be
   * routed through a dedicated inbound messaging
   * runtime rather than this consent handler.
   */
}

//--------------------------------------------------
// Consent Keyword Normalization
//--------------------------------------------------

function normalizeConsentKeyword(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    )
    .toUpperCase();
}

//--------------------------------------------------
// Opt-Out Keywords
//--------------------------------------------------

function isOptOutKeyword(
  value:
    string
): boolean {
  return [
    "STOP",
    "UNSUBSCRIBE",
    "CANCEL",
    "END",
    "QUIT",
  ].includes(
    value
  );
}

//--------------------------------------------------
// Opt-In Keywords
//--------------------------------------------------

function isOptInKeyword(
  value:
    string
): boolean {
  return [
    "START",
    "YES",
    "SUBSCRIBE",
  ].includes(
    value
  );
}

//--------------------------------------------------
// Status Mapping
//--------------------------------------------------

function mapMetaStatus(
  value:
    string |
    undefined
): OutboundMessageStatus {
  switch (
    value
      ?.trim()
      .toLowerCase()
  ) {
    case "sent":
      return OutboundMessageStatus.SENT;

    case "delivered":
      return OutboundMessageStatus.DELIVERED;

    case "read":
      return OutboundMessageStatus.READ;

    case "failed":
      return OutboundMessageStatus.FAILED;

    default:
      return OutboundMessageStatus.ACCEPTED;
  }
}

//--------------------------------------------------
// Meta Timestamp
//--------------------------------------------------

function resolveMetaTimestamp(
  value:
    string |
    undefined
): Date | null {
  if (
    !value
  ) {
    return null;
  }

  //------------------------------------------------
  // Meta timestamps are commonly Unix seconds.
  //------------------------------------------------

  const seconds =
    Number(
      value
    );

  if (
    !Number.isFinite(
      seconds
    ) ||
    seconds <=
      0
  ) {
    return null;
  }

  const date =
    new Date(
      seconds *
        1000
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

//--------------------------------------------------
// Signature Verification
//--------------------------------------------------

async function verifyMetaSignature(
  rawBody:
    string,

  signatureHeader:
    string |
    null
): Promise<boolean> {
  const appSecret =
    process.env
      .META_APP_SECRET
      ?.trim();

  if (
    !appSecret ||
    !signatureHeader
  ) {
    return false;
  }

  if (
    !signatureHeader.startsWith(
      "sha256="
    )
  ) {
    return false;
  }

  const received =
    signatureHeader
      .slice(
        "sha256=".length
      )
      .trim()
      .toLowerCase();

  //------------------------------------------------
  // SHA-256 Hex = 64 Characters
  //------------------------------------------------

  if (
    !/^[a-f0-9]{64}$/.test(
      received
    )
  ) {
    return false;
  }

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        appSecret
      ),
      {
        name:
          "HMAC",

        hash:
          "SHA-256",
      },
      false,
      [
        "sign",
      ]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        rawBody
      )
    );

  const expected =
    Array.from(
      new Uint8Array(
        signature
      )
    )
      .map(
        byte =>
          byte
            .toString(
              16
            )
            .padStart(
              2,
              "0"
            )
      )
      .join("");

  return timingSafeStringEqual(
    received,
    expected
  );
}

//--------------------------------------------------
// Timing-Safe Comparison
//--------------------------------------------------

function timingSafeStringEqual(
  left:
    string,

  right:
    string
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  let diff =
    0;

  for (
    let index =
      0;
    index <
      left.length;
    index +=
      1
  ) {
    diff |=
      left.charCodeAt(
        index
      ) ^
      right.charCodeAt(
        index
      );
  }

  return diff ===
    0;
}

//--------------------------------------------------
// Phone
//--------------------------------------------------

function normalizeInboundPhone(
  value:
    string |
    undefined
): string | null {
  if (
    !value
  ) {
    return null;
  }

  const digits =
    value
      .trim()
      .replace(
        /\D/g,
        ""
      );

  if (
    !/^[1-9]\d{7,14}$/.test(
      digits
    )
  ) {
    return null;
  }

  return `+${digits}`;
}

//--------------------------------------------------
// Mask
//--------------------------------------------------

function maskPhone(
  value:
    string
): string {
  if (
    value.length <=
    4
  ) {
    return "****";
  }

  return `${"*".repeat(
    Math.max(
      0,
      value.length -
        4
    )
  )}${value.slice(-4)}`;
}

//--------------------------------------------------
// Webhook Types
//--------------------------------------------------

interface MetaWebhookPayload {
  object?:
    string;

  entry?:
    MetaEntry[];
}

interface MetaEntry {
  id?:
    string;

  changes?:
    MetaChange[];
}

interface MetaChange {
  field?:
    string;

  value:
    MetaValue;
}

interface MetaValue {
  messaging_product?:
    string;

  metadata?: {
    display_phone_number?:
      string;

    phone_number_id?:
      string;
  };

  contacts?:
    Array<{
      profile?: {
        name?:
          string;
      };

      wa_id?:
        string;
    }>;

  statuses?:
    MetaStatus[];

  messages?:
    MetaInboundMessage[];
}

interface MetaStatus {
  id?:
    string;

  status?:
    string;

  timestamp?:
    string;

  recipient_id?:
    string;

  errors?:
    MetaStatusError[];
}

interface MetaStatusError {
  code?:
    number;

  title?:
    string;

  message?:
    string;

  error_data?: {
    details?:
      string;
  };
}

interface MetaInboundMessage {
  /*
   * Important:
   *
   * This ID is used to make inbound consent
   * processing idempotent across Meta retries.
   */
  id?:
    string;

  from?:
    string;

  timestamp?:
    string;

  type?:
    string;

  text?: {
    body?:
      string;
  };
}