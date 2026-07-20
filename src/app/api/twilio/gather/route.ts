import { NextRequest } from "next/server";
import { twiml } from "twilio";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

export async function POST(
  req: NextRequest
) {

  const form =
    await req.formData();

  const speech =
    String(
      form.get("SpeechResult") ?? ""
    );

  const callId =
    req.nextUrl.searchParams.get("callId") ??
    String(form.get("CallSid") ?? "");

  let reply =
    "Sorry, I didn't understand.";

  if (speech.trim()) {

    reply =
      await processUserMessage(
        callId,
        speech
      );

  }

  const response =
    new twiml.VoiceResponse();

  response.say(
    {
      voice: "alice",
    },
    reply
  );

  const gather =
    response.gather({

      input: ["speech"],

      speechTimeout: "auto",

      action:
        `/api/twilio/gather?callId=${callId}`,

      method: "POST",

    });

  gather.pause({
    length: 1,
  });

  return new Response(
    response.toString(),
    {
      headers: {
        "Content-Type":
          "text/xml",
      },
    }
  );

}