"use client";

import LiveMetrics from "@/components/dashboard/live-metrics";
import LiveTimeline from "@/components/dashboard/live-timeline";
import LiveActiveCalls from "@/components/dashboard/live-active-calls";

import { useDashboardEvents } from "@/hooks/use-dashboard-events";

export default function DashboardPage() {

  useDashboardEvents();

  return (

    <div className="space-y-8">

      <div>

        <h1 className="text-3xl font-bold">
          Dashboard
        </h1>

        <p className="text-muted-foreground">
          Live AI IVR Monitoring
        </p>

      </div>

      <LiveMetrics />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <LiveActiveCalls />

        <LiveTimeline />

      </div>

    </div>

  );

}