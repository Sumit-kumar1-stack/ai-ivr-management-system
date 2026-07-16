import { NextResponse } from "next/server";

import { TwiMLService } from "@/providers/telephony/twiml.service";

export async function POST() {
  const xml = TwiMLService.voiceResponse();

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

export async function GET() {
  return POST();
}