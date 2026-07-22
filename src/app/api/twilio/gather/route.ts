import {
  NextRequest,
} from "next/server";

import {
  twiml,
} from "twilio";

import {
  prisma,
} from "@/lib/prisma";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";


export async function POST(
  request: NextRequest
) {

  try {

    const {
      params,
    } = await validateTwilioWebhook(
      request
    );


    const internalCallId =
      request.nextUrl
        .searchParams
        .get("callId")
        ?.trim();


    const twilioCallSid =
      String(
        params.CallSid ??
        ""
      ).trim();


    const speech =
      String(
        params.SpeechResult ??
        ""
      ).trim();


    if (
      !internalCallId ||
      !twilioCallSid
    ) {

      return createVoiceErrorResponse(
        "The call session could not be verified."
      );

    }


    const call =
      await prisma.call.findFirst({
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

      console.warn(
        "Twilio gather call association rejected",
        {
          internalCallId,
          twilioCallSid,
        }
      );


      return new Response(
        "Forbidden",
        {
          status:
            403,
        }
      );

    }


    let reply =
      "Sorry, I did not understand.";


    if (
      speech
    ) {

      reply =
        await processUserMessage(
          internalCallId,
          speech
        );

    }


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


    return createXmlResponse(
      response.toString()
    );

  } catch (error) {

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );


    if (
      authResponse
    ) {

      return authResponse;

    }


    console.error(
      "Twilio gather webhook failed",
      {
        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      }
    );


    return createVoiceErrorResponse(
      "An error occurred while processing your request."
    );

  }

}


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