import { NextRequest } from "next/server";
import { twiml } from "twilio";

export async function POST(req: NextRequest) {

  const form = await req.formData();

  const callId =
    String(
      form.get("CallSid") ?? ""
    );

  const response =
    new twiml.VoiceResponse();

  const gather =
    response.gather({

      input: ["speech"],

      speechTimeout: "auto",

      action:
        `/api/twilio/gather?callId=${callId}`,

      method: "POST",

    });

  gather.say(
    {
      voice: "alice",
    },
    "Hello. Welcome to ABC Company. How may I help you today?"
  );

  return new Response(
    response.toString(),
    {
      headers: {
        "Content-Type": "text/xml",
      },
    }
  );

}