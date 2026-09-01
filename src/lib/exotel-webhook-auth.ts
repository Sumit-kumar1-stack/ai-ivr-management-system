import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getExotelEnvironment,
} from "@/config/env";

import {
  createLogger,
} from "@/lib/logger";

const log =
  createLogger({
    component:
      "exotel-webhook-auth",
  });

export class ExotelWebhookAuthenticationError extends Error {
  constructor(
    message = "Invalid Exotel webhook authentication"
  ) {
    super(
      message
    );

    this.name =
      "ExotelWebhookAuthenticationError";
  }
}

/**
 * Generates a message-bound HMAC-SHA256 token for Exotel SMS status callback authentication.
 * Never includes raw long-lived secrets in callback URLs.
 */
export function generateExotelMessageStatusToken(
  messageId: string,
  secret?: string
): string {
  const normalizedId =
    messageId.trim();

  if (
    !normalizedId
  ) {
    return "";
  }

  const webhookSecret =
    (
      secret ??
      process.env
        .EXOTEL_WEBHOOK_SECRET
    )?.trim();

  if (
    !webhookSecret
  ) {
    return "";
  }

  return createHmac(
    "sha256",
    webhookSecret
  )
    .update(
      `exotel-sms-status:${normalizedId}`
    )
    .digest(
      "hex"
    );
}

/**
 * Validates a message-bound HMAC-SHA256 token for Exotel SMS status callbacks.
 */
export function validateExotelMessageStatusToken(
  messageId: string,
  suppliedToken: string,
  secret?: string
): boolean {
  const normalizedId =
    messageId.trim();

  const normalizedToken =
    suppliedToken.trim();

  if (
    !normalizedId ||
    !normalizedToken
  ) {
    return false;
  }

  const expectedToken =
    generateExotelMessageStatusToken(
      normalizedId,
      secret
    );

  if (
    !expectedToken
  ) {
    return false;
  }

  return safeEqual(
    expectedToken,
    normalizedToken
  );
}

/**
 * Validates generic Exotel webhooks (e.g. telephony / AgentStream).
 */
export async function validateExotelWebhook(
  request: NextRequest
): Promise<Record<string, string>> {
  const expected =
    getExotelEnvironment().webhookSecret;

  const supplied =
    request.headers
      .get(
        "x-exotel-webhook-secret"
      )
      ?.trim() ||
    request.nextUrl
      .searchParams
      .get(
        "token"
      )
      ?.trim() ||
    "";

  if (
    !safeEqual(
      expected,
      supplied
    )
  ) {
    log.warn(
      {
        event:
          "exotel.webhook.authentication_rejected",

        pathname:
          request
            .nextUrl
            .pathname,

        secretPresent:
          Boolean(
            supplied
          ),
      },
      "Exotel webhook authentication rejected"
    );

    throw new ExotelWebhookAuthenticationError();
  }

  const params: Record<
    string,
    string
  > = {};

  if (
    request.method ===
    "GET"
  ) {
    request.nextUrl.searchParams.forEach(
      (
        value,
        key
      ) => {
        params[
          key
        ] =
          value;
      }
    );

    return params;
  }

  const contentType =
    request.headers.get(
      "content-type"
    ) ??
    "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    const payload =
      (await request.json()) as Record<
        string,
        unknown
      >;

    for (const [
      key,
      value,
    ] of Object.entries(
      payload
    )) {
      if (
        typeof value ===
          "string" ||
        typeof value ===
          "number"
      ) {
        params[
          key
        ] =
          String(
            value
          );
      }
    }
  } else {
    const form =
      await request.formData();

    form.forEach(
      (
        value,
        key
      ) => {
        if (
          typeof value ===
          "string"
        ) {
          params[
            key
          ] =
            value;
        }
      }
    );
  }

  return params;
}

/**
 * Validates Exotel SMS status callbacks using either:
 * 1. A message-bound HMAC-SHA256 token in the URL query (?messageId=...&token=...)
 * 2. An explicit x-exotel-webhook-secret header
 *
 * Never requires or allows raw long-lived secrets in URLs.
 */
export async function validateExotelSmsStatusWebhook(
  request: NextRequest
): Promise<{
  params: Record<
    string,
    string
  >;
  messageId: string;
}> {
  const messageId =
    request.nextUrl
      .searchParams
      .get(
        "messageId"
      )
      ?.trim() ||
    "";

  const suppliedToken =
    request.nextUrl
      .searchParams
      .get(
        "token"
      )
      ?.trim() ||
    "";

  const headerSecret =
    request.headers
      .get(
        "x-exotel-webhook-secret"
      )
      ?.trim() ||
    "";

  const webhookSecret =
    process.env
      .EXOTEL_WEBHOOK_SECRET
      ?.trim() ||
    "";

  if (
    !webhookSecret
  ) {
    log.warn(
      {
        event:
          "exotel.sms.status_auth_missing_secret",

        pathname:
          request
            .nextUrl
            .pathname,
      },
      "Exotel SMS status webhook rejected: EXOTEL_WEBHOOK_SECRET is not configured"
    );

    throw new ExotelWebhookAuthenticationError(
      "Webhook secret is not configured"
    );
  }

  const isHeaderValid =
    Boolean(
      headerSecret
    ) &&
    safeEqual(
      webhookSecret,
      headerSecret
    );

  const isTokenValid =
    Boolean(
      messageId
    ) &&
    Boolean(
      suppliedToken
    ) &&
    validateExotelMessageStatusToken(
      messageId,
      suppliedToken,
      webhookSecret
    );

  if (
    !isHeaderValid &&
    !isTokenValid
  ) {
    log.warn(
      {
        event:
          "exotel.sms.status_authentication_rejected",

        pathname:
          request
            .nextUrl
            .pathname,

        tokenPresent:
          Boolean(
            suppliedToken
          ),

        headerPresent:
          Boolean(
            headerSecret
          ),

        messageIdPresent:
          Boolean(
            messageId
          ),
      },
      "Exotel SMS status webhook authentication rejected"
    );

    throw new ExotelWebhookAuthenticationError();
  }

  const params: Record<
    string,
    string
  > = {};

  if (
    request.method ===
    "GET"
  ) {
    request.nextUrl.searchParams.forEach(
      (
        value,
        key
      ) => {
        params[
          key
        ] =
          value;
      }
    );

    return {
      params,
      messageId,
    };
  }

  const contentType =
    request.headers.get(
      "content-type"
    ) ??
    "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    const payload =
      (await request.json()) as Record<
        string,
        unknown
      >;

    for (const [
      key,
      value,
    ] of Object.entries(
      payload
    )) {
      if (
        typeof value ===
          "string" ||
        typeof value ===
          "number"
      ) {
        params[
          key
        ] =
          String(
            value
          );
      }
    }
  } else {
    const form =
      await request.formData();

    form.forEach(
      (
        value,
        key
      ) => {
        if (
          typeof value ===
          "string"
        ) {
          params[
            key
          ] =
            value;
        }
      }
    );
  }

  return {
    params,
    messageId,
  };
}

export function createExotelAuthErrorResponse(
  error: unknown
): NextResponse | null {
  return error instanceof
    ExotelWebhookAuthenticationError
    ? NextResponse.json(
        {
          success:
            false,

          message:
            "Forbidden",
        },
        {
          status:
            403,
        }
      )
    : null;
}

export function safeEqual(
  expected: string,
  actual: string
): boolean {
  const left =
    Buffer.from(
      expected
    );

  const right =
    Buffer.from(
      actual
    );

  return (
    left.length ===
      right.length &&
    timingSafeEqual(
      left,
      right
    )
  );
}

