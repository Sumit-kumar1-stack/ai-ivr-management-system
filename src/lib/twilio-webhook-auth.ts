import {
  NextRequest,
  NextResponse,
} from "next/server";

import twilio from "twilio";


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
    request.headers.get(
      "x-twilio-signature"
    )?.trim();


  if (
    !signature
  ) {

    throw new TwilioWebhookAuthenticationError(
      "Missing X-Twilio-Signature header"
    );

  }


  const authToken =
    process.env
      .TWILIO_AUTH_TOKEN
      ?.trim();


  if (
    !authToken
  ) {

    throw new Error(
      "TWILIO_AUTH_TOKEN is not configured"
    );

  }


  const publicOrigin =
    normalizePublicOrigin(
      process.env
        .TWILIO_PUBLIC_BASE_URL ??
      process.env.APP_URL
    );


  if (
    !publicOrigin
  ) {

    throw new Error(
      "TWILIO_PUBLIC_BASE_URL or APP_URL is not configured"
    );

  }


  //------------------------------------------------
  // Read body once
  //------------------------------------------------

  const formData =
    await request.formData();


  const params:
    Record<string, string> = {};


  for (
    const [
      key,
      value,
    ] of formData.entries()
  ) {

    if (
      typeof value ===
      "string"
    ) {

      params[key] =
        value;

    }

  }


  //------------------------------------------------
  // Rebuild URL using trusted public origin
  //------------------------------------------------

  const incomingUrl =
    new URL(
      request.url
    );


  /*
   * Preserve pathname and encoded query string,
   * but do not trust the incoming Host header.
   */
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

    console.warn(
      "Twilio webhook signature rejected",
      {
        pathname:
          incomingUrl.pathname,

        validationUrl,

        callSid:
          params.CallSid,
      }
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
// Authentication Error Response
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
// Trusted Public Origin
//--------------------------------------------------

function normalizePublicOrigin(
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
      );


  if (
    !normalized
  ) {

    return null;

  }


  const url =
    new URL(
      normalized
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