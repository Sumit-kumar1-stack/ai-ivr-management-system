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

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-gather-route"
  );

//--------------------------------------------------
// Twilio Gather Webhook
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<Response> {
  let internalCallId =
    "";

  let twilioCallSid =
    "";

  try {
    //----------------------------------------------
    // Validate Twilio Signature
    //----------------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ??
      "";

    twilioCallSid =
      String(
        params.CallSid ??
          ""
      ).trim();

    const speech =
      String(
        params.SpeechResult ??
          ""
      ).trim();

    //----------------------------------------------
    // Validate Required Identifiers
    //----------------------------------------------

    if (
      !internalCallId ||
      !twilioCallSid
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.gather.rejected",

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

          speechPresent:
            Boolean(
              speech
            ),

          speechCharacterCount:
            speech.length,
        },
        "Twilio gather request rejected"
      );

      return createVoiceErrorResponse(
        "The call session could not be verified."
      );
    }

    const log =
      createCallLogger(
        internalCallId
      );

    //----------------------------------------------
    // Validate Call Association
    //----------------------------------------------

    const call =
      await prisma.call
        .findFirst({
          where: {
            id:
              internalCallId,

            providerCallId:
              twilioCallSid,
          },

          select: {
            id:
              true,
          },
        });

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.gather.rejected",

          reason:
            "call_association_failed",

          providerCallIdPresent:
            true,

          speechPresent:
            Boolean(
              speech
            ),
        },
        "Twilio gather call association rejected"
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
    // Process Speech
    //----------------------------------------------

    let reply =
      "Sorry, I did not understand.";

    if (
      speech
    ) {
      log.info(
        {
          event:
            "twilio.gather.speech_received",

          speechCharacterCount:
            speech.length,
        },
        "Twilio speech input received"
      );

      reply =
        await processUserMessage(
          internalCallId,
          speech
        );
    } else {
      log.debug(
        {
          event:
            "twilio.gather.empty_speech",

          speechPresent:
            false,
        },
        "Twilio gather contained no speech"
      );
    }

    //----------------------------------------------
    // Build TwiML
    //----------------------------------------------

    const response =
      new twiml.VoiceResponse();

    response.say(
      {
        voice:
          "alice",
      },
      reply
    );

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

    gather.pause({
      length:
        1,
    });

    log.info(
      {
        event:
          "twilio.gather.completed",

        speechPresent:
          Boolean(
            speech
          ),

        speechCharacterCount:
          speech.length,

        replyCharacterCount:
          reply.length,
      },
      "Twilio gather request completed"
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
          "twilio.gather.failed",

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
      "Twilio gather webhook failed"
    );

    return createVoiceErrorResponse(
      "An error occurred while processing your request."
    );
  }
}

//--------------------------------------------------
// Voice Error Response
//--------------------------------------------------

function createVoiceErrorResponse(
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