import { NextRequest, NextResponse } from "next/server";

import { updateCallStatus } from "@/services/calls/call.service";
import { CallWebhookSchema } from "@/lib/validators/call-webhook";

export async function POST(
  req: NextRequest
) {
  const body = await req.json();

  // Validate request payload
  const payload = CallWebhookSchema.parse(body);

  await updateCallStatus({
    providerCallId: payload.providerCallId,
    status: payload.status,
    duration: payload.duration,
  });

  return NextResponse.json({
    success: true,
  });
}