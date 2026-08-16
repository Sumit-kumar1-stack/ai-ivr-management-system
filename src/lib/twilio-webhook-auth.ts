import {
  NextRequest,
  NextResponse,
} from "next/server";

import twilio from "twilio";

import {
  getTwilioEnvironment,
} from "@/config/env";

import {
  createLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createLogger({
    component:
      "twilio-webhook-auth",
  });

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface ValidatedTwilioWebhook {
  formData: FormData;

  params: Record<
    string,
    string
  >;

  validationUrl: string;
}

export class TwilioWebhookAuthenticationError
  extends Error {
  constructor(
    message =
      "Invalid Twilio webhook signature"
  ) {
    super(
      message
    );

    this.name =
      "TwilioWebhookAuthenticationError";
  }
}

//--------------------------------------------------
// Validate Twilio Form Webhook
//--------------------------------------------------

export async function validateTwilioWebhook(
  request: NextRequest
): Promise<ValidatedTwilioWebhook> {
  const signature =
    request.headers
      .get(
        "x-twilio-signature"
      )
      ?.trim();

  if (
    !signature
  ) {
    throw new TwilioWebhookAuthenticationError(
      "Missing X-Twilio-Signature header"
    );
  }

  const environment =
    getTwilioEnvironment();

  const authToken =
    environment.authToken;

  const publicOrigin =
    normalizePublicOrigin(
      environment.publicBaseUrl
    );

  //----------------------------------------------
  // Read request body once
  //----------------------------------------------

  const formData =
    await request.formData();

  const params:
    Record<
      string,
      string
    > = {};

  formData.forEach(
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

  //----------------------------------------------
  // Rebuild URL using trusted public origin
  //----------------------------------------------

  const incomingUrl =
    new URL(
      request.url
    );

  const validationUrl =
    `${publicOrigin}` +
    `${incomingUrl.pathname}` +
    `${incomingUrl.search}`;

  const valid =
    twilio.validateRequest(
      authToken,
      signature,
      validationUrl,
      params
    );

  if (
    !valid
  ) {
    log.warn(
      {
        event:
          "twilio.webhook.signature_rejected",

        method:
          request.method,

        pathname:
          incomingUrl.pathname,

        signaturePresent:
          true,

        providerCallIdPresent:
          Boolean(
            params.CallSid
          ),

        parameterCount:
          Object.keys(
            params
          ).length,
      },
      "Twilio webhook signature rejected"
    );

    throw new TwilioWebhookAuthenticationError();
  }

  return {
    formData,
    params,
    validationUrl,
  };
}

//--------------------------------------------------
// Authentication error response
//--------------------------------------------------

export function createTwilioAuthErrorResponse(
  error: unknown
): NextResponse | null {
  if (
    error instanceof
    TwilioWebhookAuthenticationError
  ) {
    return NextResponse.json(
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
    );
  }

  return null;
}

//--------------------------------------------------
// Trusted public origin
//--------------------------------------------------

function normalizePublicOrigin(
  value: string
): string {
  const url =
    new URL(
      value
    );

  if (
    url.protocol !==
      "https:" &&
    url.protocol !==
      "http:"
  ) {
    throw new Error(
      "TWILIO_PUBLIC_BASE_URL must use HTTP or HTTPS"
    );
  }

  return url.origin;
}