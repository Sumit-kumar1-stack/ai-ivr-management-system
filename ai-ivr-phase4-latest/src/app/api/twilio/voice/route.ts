import {
  NextRequest,
} from "next/server";

import {
  twiml,
} from "twilio";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-voice-route"
  );

//--------------------------------------------------
// Twilio Voice Webhook
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<Response> {
  let internalCallId =
    "";

  let twilioCallSid =
    "";

  try {
    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    twilioCallSid =
      String(
        params.CallSid ??
          ""
      ).trim();

    internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ??
      "";

    //----------------------------------------------
    // Validate Required Identifiers
    //----------------------------------------------

    if (
      !twilioCallSid ||
      !internalCallId
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.voice.rejected",

          reason:
            "missing_call_identifiers",

          internalCallIdPresent:
            Boolean(
              internalCallId
            ),

          providerCallIdPresent:
            Boolean(
              twilioCallSid
            ),
        },
        "Twilio voice request rejected"
      );

      return createErrorTwiML(
        "The call session could not be verified."
      );
    }

    const log =
      createCallLogger(
        internalCallId
      );

    //----------------------------------------------
    // Validate Internal Call Association
    //----------------------------------------------

    const call =
      await prisma.call
        .findFirst({
          where: {
            id:
              internalCallId,

            OR: [
              {
                providerCallId:
                  twilioCallSid,
              },
              {
                providerCallId:
                  null,
              },
            ],
          },

          select: {
            id:
              true,

            providerCallId:
              true,
          },
        });

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.voice.rejected",

          reason:
            "call_association_failed",

          providerCallIdPresent:
            true,
        },
        "Twilio voice call association rejected"
      );

      return new Response(
        "Forbidden",
        {
          status:
            403,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    //----------------------------------------------
    // Associate Provider Call ID
    //----------------------------------------------

    if (
      !call.providerCallId
    ) {
      const associationResult =
        await prisma.call
          .updateMany({
            where: {
              id:
                internalCallId,

              providerCallId:
                null,
            },

            data: {
              providerCallId:
                twilioCallSid,
            },
          });

      log.info(
        {
          event:
            "twilio.voice.provider_id_associated",

          providerCallIdPresent:
            true,

          updatedRecordCount:
            associationResult.count,
        },
        "Twilio provider call ID associated"
      );
    }

    //----------------------------------------------
    // Build Initial Gather Response
    //----------------------------------------------

    const response =
      new twiml.VoiceResponse();

    const gather =
      response.gather({
        input: [
          "speech",
        ],

        speechTimeout:
          "auto",

        action:
          `/api/twilio/gather?callId=${encodeURIComponent(
            internalCallId
          )}`,

        method:
          "POST",
      });

    const greeting =
      "Hello. Welcome to ABC Company. How may I help you today?";

    gather.say(
      {
        voice:
          "alice",
      },
      greeting
    );

    log.info(
      {
        event:
          "twilio.voice.twiml_created",

        providerCallIdPresent:
          true,

        greetingCharacterCount:
          greeting.length,

        speechGatherEnabled:
          true,
      },
      "Twilio voice TwiML created"
    );

    return createXmlResponse(
      response.toString()
    );
  } catch (
    error
  ) {
    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    const log =
      internalCallId
        ? createCallLogger(
            internalCallId
          )
        : serviceLog;

    log.error(
      {
        event:
          "twilio.voice.failed",

        internalCallIdPresent:
          Boolean(
            internalCallId
          ),

        providerCallIdPresent:
          Boolean(
            twilioCallSid
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Twilio voice webhook failed"
    );

    return createErrorTwiML(
      "An error occurred while starting the call."
    );
  }
}

//--------------------------------------------------
// Error TwiML
//--------------------------------------------------

function createErrorTwiML(
  message: string
): Response {
  const response =
    new twiml.VoiceResponse();

  response.say(
    {
      voice:
        "alice",
    },
    message
  );

  response.hangup();

  return createXmlResponse(
    response.toString()
  );
}

//--------------------------------------------------
// XML Response
//--------------------------------------------------

function createXmlResponse(
  xml: string
): Response {
  return new Response(
    xml,
    {
      status:
        200,

      headers: {
        "Content-Type":
          "text/xml; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    }
  );
}