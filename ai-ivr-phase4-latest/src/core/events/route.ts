import { NextResponse } from "next/server";

import {
  EventMonitor,
} from "@/core/events/event-monitor.service";

export async function GET() {

  return NextResponse.json(

    EventMonitor.getAll()

  );

}