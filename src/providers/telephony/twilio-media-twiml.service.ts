//--------------------------------------------------
// Types
//--------------------------------------------------

export interface CreateMediaStreamTwimlInput {
  internalCallId:
    string;

  twilioCallSid:
    string;

  direction?:
    | "INBOUND"
    | "OUTBOUND";
}

//--------------------------------------------------
// Create Media Stream TwiML
//--------------------------------------------------

export function createMediaStreamTwiml(
  input:
    CreateMediaStreamTwimlInput
): string {
  const internalCallId =
    input.internalCallId.trim();

  const twilioCallSid =
    input.twilioCallSid.trim();

  //----------------------------------------------
  // Validate Input
  //----------------------------------------------

  if (
    !internalCallId
  ) {
    throw new Error(
      "Internal call ID is required"
    );
  }

  if (
    !twilioCallSid
  ) {
    throw new Error(
      "Twilio Call SID is required"
    );
  }

  //----------------------------------------------
  // Public Application URL
  //----------------------------------------------

  const appUrl =
    normalizePublicUrl(
      process.env
        .TWILIO_PUBLIC_BASE_URL ||
      process.env
        .APP_URL
    );

  if (
    !appUrl
  ) {
    throw new Error(
      "TWILIO_PUBLIC_BASE_URL or APP_URL is not configured"
    );
  }

  //----------------------------------------------
  // Media WebSocket Public URL
  //----------------------------------------------

  const mediaPublicUrl =
    normalizePublicUrl(
      process.env
        .TWILIO_MEDIA_PUBLIC_URL
    );

  if (
    !mediaPublicUrl
  ) {
    throw new Error(
      "TWILIO_MEDIA_PUBLIC_URL is not configured"
    );
  }

  //----------------------------------------------
  // Build Stream URL
  //----------------------------------------------

  const streamUrl =
    toWebSocketUrl(
      mediaPublicUrl,
      "/api/twilio/stream"
    );

  //----------------------------------------------
  // Stream Status Callback
  //----------------------------------------------

  const streamStatusUrl =
    new URL(
      "/api/twilio/stream-status",
      `${appUrl}/`
    ).toString();

  //----------------------------------------------
  // Direction
  //----------------------------------------------

  const direction =
    input.direction ??
    "INBOUND";

  //----------------------------------------------
  // TwiML
  //----------------------------------------------

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream
      url="${escapeXml(streamUrl)}"
      statusCallback="${escapeXml(streamStatusUrl)}"
      statusCallbackMethod="POST"
    >
      <Parameter
        name="callId"
        value="${escapeXml(internalCallId)}"
      />
      <Parameter
        name="twilioCallSid"
        value="${escapeXml(twilioCallSid)}"
      />
      <Parameter
        name="direction"
        value="${escapeXml(direction)}"
      />
    </Stream>
  </Connect>
</Response>`;
}

//--------------------------------------------------
// Create Error TwiML
//--------------------------------------------------

export function createErrorTwiml(
  message:
    string
): string {
  const normalizedMessage =
    message.trim() ||
    "We are unable to process your call right now.";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXml(normalizedMessage)}</Say>
  <Hangup />
</Response>`;
}

//--------------------------------------------------
// Create HTTP TwiML Response
//--------------------------------------------------

export function createTwimlResponse(
  xml:
    string,

  status:
    number =
    200
): Response {
  return new Response(
    xml.trim(),
    {
      status,

      headers: {
        "Content-Type":
          "text/xml; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    }
  );
}

//--------------------------------------------------
// Normalize Public URL
//--------------------------------------------------

function normalizePublicUrl(
  value:
    | string
    | undefined
): string | null {
  const normalized =
    value
      ?.trim()
      .replace(
        /\/+$/,
        ""
      ) ??
    "";

  if (
    !normalized
  ) {
    return null;
  }

  //----------------------------------------------
  // Validate URL
  //----------------------------------------------

  let url:
    URL;

  try {
    url =
      new URL(
        normalized
      );
  } catch {
    throw new Error(
      `Invalid public URL: ${normalized}`
    );
  }

  //----------------------------------------------
  // Supported Protocol
  //----------------------------------------------

  if (
    url.protocol !==
      "http:" &&
    url.protocol !==
      "https:" &&
    url.protocol !==
      "ws:" &&
    url.protocol !==
      "wss:"
  ) {
    throw new Error(
      `Unsupported public URL protocol: ${url.protocol}`
    );
  }

  return normalized;
}

//--------------------------------------------------
// Convert To WebSocket URL
//--------------------------------------------------

function toWebSocketUrl(
  baseUrl:
    string,

  pathname:
    string
): string {
  const normalizedBase =
    baseUrl
      .trim()
      .replace(
        /\/+$/,
        ""
      );

  const normalizedPath =
    pathname.startsWith(
      "/"
    )
      ? pathname
      : `/${pathname}`;

  const url =
    new URL(
      `${normalizedBase}${normalizedPath}`
    );

  //----------------------------------------------
  // HTTP -> WS
  //----------------------------------------------

  if (
    url.protocol ===
    "https:"
  ) {
    url.protocol =
      "wss:";
  } else if (
    url.protocol ===
    "http:"
  ) {
    url.protocol =
      "ws:";
  } else if (
    url.protocol !==
      "ws:" &&
    url.protocol !==
      "wss:"
  ) {
    throw new Error(
      `Unsupported Media Stream protocol: ${url.protocol}`
    );
  }

  return url.toString();
}

//--------------------------------------------------
// Escape XML
//--------------------------------------------------

function escapeXml(
  value:
    string
): string {
  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );
}