import { NextResponse } from "next/server";

import {
  updateCallStatus,
} from "@/services/calls/call.service";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const providerCallId = String(
      form.get("CallSid") ?? ""
    );

    const callStatus = String(
      form.get("CallStatus") ?? ""
    );

    const duration = Number(
      form.get("CallDuration") ?? 0
    );

    console.log("📞 Twilio Status");

    console.table({
      providerCallId,
      callStatus,
      duration,
    });

    await updateCallStatus({
      providerCallId,
      status: callStatus.toLowerCase(),
      duration,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
  });
}