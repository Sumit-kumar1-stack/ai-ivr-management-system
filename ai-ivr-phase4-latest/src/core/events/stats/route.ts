import { NextResponse } from "next/server";

import {
  EventMonitor,
} from "@/core/events/event-monitor.service";

export async function GET() {

  const events =
    EventMonitor.getAll();

  return NextResponse.json({

    total: events.length,

    latest:
      events[0] ?? null,

  });

}