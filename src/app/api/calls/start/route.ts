import { NextResponse } from "next/server";

import { startCall } from "@/services/telephony/telephony.service";

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const result = await startCall(body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Start Call Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to start call",
      },
      {
        status: 500,
      }
    );
  }
}