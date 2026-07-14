import { NextResponse } from "next/server";

import { updateCallStatus } from "@/services/calls/call.service";

export async function POST(req: Request) {
  const body = await req.json();

  await updateCallStatus({
    providerCallId: body.callId,
    status: body.status,
    duration: body.duration,
  });

  return NextResponse.json({
    success: true,
  });
}