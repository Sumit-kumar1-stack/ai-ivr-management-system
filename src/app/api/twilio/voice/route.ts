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


    const twilioCallSid =
      String(
        params.CallSid ??
        ""
      ).trim();


    const internalCallId =
      request.nextUrl
        .searchParams
        .get("callId")
        ?.trim();


    if (
      !twilioCallSid ||
      !internalCallId
    ) {

      return createErrorTwiML(
        "The call session could not be verified."
      );

    }


    const call =
      await prisma.call.findFirst({
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

      return new Response(
        "Forbidden",
        {
          status:
            403,
        }
      );

    }


    if (
      !call.providerCallId
    ) {

      await prisma.call.updateMany({
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

    }


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


    gather.say(
      {
        voice:
          "alice",
      },
      "Hello. Welcome to ABC Company. How may I help you today?"
    );


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
      "Twilio voice webhook failed",
      error
    );


    return createErrorTwiML(
      "An error occurred while starting the call."
    );

  }

}


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