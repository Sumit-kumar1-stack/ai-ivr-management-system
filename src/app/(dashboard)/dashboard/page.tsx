"use client";

import Link from "next/link";

import LiveMetrics from "@/components/dashboard/live-metrics";
import LiveTimeline from "@/components/dashboard/live-timeline";
import LiveActiveCalls from "@/components/dashboard/live-active-calls";

import {
  useDashboardEvents,
} from "@/hooks/use-dashboard-events";

export default function DashboardPage() {
  useDashboardEvents();

  return (
    <div className="space-y-8">
      {/* Header */}

      <div
        className="
          flex
          flex-col
          gap-4
          lg:flex-row
          lg:items-center
          lg:justify-between
        "
      >
        <div>
          <h1
            className="
              text-3xl
              font-bold
            "
          >
            Dashboard
          </h1>

          <p
            className="
              mt-1
              text-muted-foreground
            "
          >
            Live AI IVR Monitoring
          </p>
        </div>

        <Link
          href="/calls"
          className="
            inline-flex
            h-10
            w-fit
            items-center
            justify-center
            rounded-md
            bg-primary
            px-4
            text-sm
            font-medium
            text-primary-foreground
            transition-colors
            hover:bg-primary/90
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-ring
          "
        >
          View All Calls
        </Link>
      </div>

      {/* Live metrics */}

      <LiveMetrics />

      {/* Live monitoring panels */}

      <div
        className="
          grid
          grid-cols-1
          gap-6
          lg:grid-cols-2
        "
      >
        <LiveActiveCalls />

        <LiveTimeline />
      </div>
    </div>
  );
}