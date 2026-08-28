import { NextResponse } from "next/server";

import {
  EventMonitor,
} from "@/core/events/event-monitor.service";

export async function DELETE() {

  EventMonitor.clear();

  return NextResponse.json({

    success: true,

  });

}