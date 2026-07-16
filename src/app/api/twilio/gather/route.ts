import { NextResponse } from "next/server";

import { TwiMLService } from "@/providers/telephony/twiml.service";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  getCallByProviderId,
} from "@/services/calls/call.service";

export async function POST(req: Request) {

  try {

    const form =
      await req.formData();

    const speech =
      String(
        form.get("SpeechResult") ?? ""
      );

    const confidence =
      Number(
        form.get("Confidence") ?? 0
      );

    const providerCallId =
      String(
        form.get("CallSid") ?? ""
      );

    console.log("\n========== GATHER ==========");

    console.log("Speech:", speech);

    console.log("Confidence:", confidence);

    console.log("============================\n");

    if (!speech.trim()) {

      const xml =
        TwiMLService.continueConversation();

      return new NextResponse(xml, {
        headers: {
          "Content-Type": "text/xml",
        },
      });

    }

    const call =
      await getCallByProviderId(
        providerCallId
      );

    if (!call) {

      const xml =
        TwiMLService.hangup(
          "Call not found."
        );

      return new NextResponse(xml, {
        headers: {
          "Content-Type": "text/xml",
        },
      });

    }

    const reply =
      await processUserMessage(
        call.id,
        speech
      );

    const xml =
      TwiMLService.speak(reply);

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });

  }

  catch (error) {

    console.error(error);

    const xml =
      TwiMLService.hangup(
        "An internal error occurred."
      );

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });

  }

}