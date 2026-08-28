import pino, {
  Logger as PinoLogger,
} from "pino";

//--------------------------------------------------
// Environment
//--------------------------------------------------

const isDevelopment =
  process.env.NODE_ENV !==
  "production";

const logLevel =
  process.env.LOG_LEVEL
    ?.trim() ||
  "info";

//--------------------------------------------------
// Root Logger
//--------------------------------------------------

export const Logger =
  pino({
    level:
      logLevel,

    transport:
      isDevelopment
        ? {
            target:
              "pino-pretty",

            options: {
              colorize:
                true,

              translateTime:
                "SYS:standard",

              ignore:
                "pid,hostname",

              singleLine:
                false,
            },
          }
        : undefined,

    base: {
      service:
        "ai-ivr-management-system",

      environment:
        process.env.NODE_ENV ??
        "development",
    },

    redact: {
      paths: [
        "password",
        "token",
        "accessToken",
        "refreshToken",
        "authorization",
        "Authorization",
        "headers.authorization",
        "headers.Authorization",
        "authToken",
        "accountSid",
        "apiKey",
        "apiToken",
        "secret",
        "webhookSecret",
        "EXOTEL_API_KEY",
        "EXOTEL_API_TOKEN",
        "EXOTEL_WEBHOOK_SECRET",
        "PLIVO_AUTH_TOKEN",
        "clientSecret",
        "recordingUrl",
        "voiceUrl",
        "statusCallbackUrl",
        "recordingCallbackUrl",
        "record_url",
        "recording_url",
      ],

      censor:
        "[REDACTED]",
    },

    timestamp:
      pino.stdTimeFunctions
        .isoTime,
  });

//--------------------------------------------------
// Error Shape
//--------------------------------------------------

export interface NormalizedError {
  name?: string;

  message: string;

  code?:
    | string
    | number;

  stack?: string;
}

//--------------------------------------------------
// Normalize Unknown Error
//--------------------------------------------------

export function normalizeError(
  error: unknown
): NormalizedError {
  if (
    error instanceof
    Error
  ) {
    const errorWithCode =
      error as Error & {
        code?:
          | string
          | number;
      };

    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,

      stack:
        error.stack,
    };
  }

  if (
    typeof error ===
    "string"
  ) {
    return {
      message:
        error,
    };
  }

  try {
    return {
      message:
        JSON.stringify(
          error
        ),
    };
  } catch {
    return {
      message:
        String(
          error
        ),
    };
  }
}

//--------------------------------------------------
// Mask Phone Number
//--------------------------------------------------

export function maskPhoneNumber(
  phone:
    | string
    | null
    | undefined
): string {
  const normalized =
    phone?.trim() ??
    "";

  if (
    !normalized
  ) {
    return "unknown";
  }

  if (
    normalized.length <=
    4
  ) {
    return "****";
  }

  const visibleDigits =
    normalized.slice(
      -4
    );

  const maskedLength =
    Math.max(
      normalized.length -
        4,
      4
    );

  return `${"*".repeat(
    maskedLength
  )}${visibleDigits}`;
}

//--------------------------------------------------
// Duration Helper
//--------------------------------------------------

export function getDurationMs(
  startedAt:
    | number
    | bigint
): number {
  if (
    typeof startedAt ===
    "bigint"
  ) {
    return Number(
      (
        process.hrtime.bigint() -
        startedAt
      ) /
        BigInt(
          1_000_000
        )
    );
  }

  return Math.max(
    Date.now() -
      startedAt,
    0
  );
}

//--------------------------------------------------
// Generic Child Logger
//--------------------------------------------------

export function createLogger(
  bindings:
    Record<
      string,
      unknown
    >
): PinoLogger {
  return Logger.child(
    bindings
  );
}

//--------------------------------------------------
// Request Logger
//--------------------------------------------------

export function createRequestLogger(
  requestId: string
): PinoLogger {
  return createLogger({
    component:
      "http-request",

    requestId,
  });
}

//--------------------------------------------------
// Server Logger
//--------------------------------------------------

export function createServerLogger(
  component:
    string =
      "application-server"
): PinoLogger {
  return createLogger({
    component,
  });
}

//--------------------------------------------------
// Worker Logger
//--------------------------------------------------

export function createWorkerLogger(
  workerName: string,
  bindings?:
    Record<
      string,
      unknown
    >
): PinoLogger {
  return createLogger({
    component:
      "background-worker",

    worker:
      workerName,

    ...bindings,
  });
}

//--------------------------------------------------
// Campaign Logger
//--------------------------------------------------

export function createCampaignLogger(
  campaignId: string,
  campaignRunId?: string
): PinoLogger {
  return createLogger({
    component:
      "campaign",

    campaignId,

    ...(campaignRunId
      ? {
          campaignRunId,
        }
      : {}),
  });
}

//--------------------------------------------------
// Campaign Run Logger
//--------------------------------------------------

export function createCampaignRunLogger(
  campaignRunId: string,
  campaignId?: string
): PinoLogger {
  return createLogger({
    component:
      "campaign-run",

    campaignRunId,

    ...(campaignId
      ? {
          campaignId,
        }
      : {}),
  });
}

//--------------------------------------------------
// Contact Logger
//--------------------------------------------------

export function createContactLogger(
  contactId: string,
  bindings?:
    Record<
      string,
      unknown
    >
): PinoLogger {
  return createLogger({
    component:
      "contact",

    contactId,

    ...bindings,
  });
}

//--------------------------------------------------
// Call Logger
//--------------------------------------------------

export function createCallLogger(
  callId: string,
  bindings?:
    Record<
      string,
      unknown
    >
): PinoLogger {
  return createLogger({
    component:
      "call",

    callId,

    ...bindings,
  });
}

//--------------------------------------------------
// Conversation Logger
//--------------------------------------------------

export function createConversationLogger(
  conversationId: string,
  bindings?:
    Record<
      string,
      unknown
    >
): PinoLogger {
  return createLogger({
    component:
      "conversation",

    conversationId,

    ...bindings,
  });
}
