import { NextResponse } from "next/server";
import { CallEventRepository } from "@/features/call-events/call-event.repository";

export async function GET() {

  const events = await CallEventRepository.getLatest(100);

  return NextResponse.json(events);

}