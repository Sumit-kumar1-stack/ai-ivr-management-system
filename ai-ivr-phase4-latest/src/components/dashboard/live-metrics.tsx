"use client";

import StatsCard from "@/components/layout/stats-card";

import {
  useDashboardStore,
} from "@/store/dashboard.store";

export default function LiveMetrics() {
  const metrics =
    useDashboardStore(
      (
        state
      ) =>
        state.metrics
    );

  return (
    <div
      className="
        grid
        grid-cols-1
        gap-5
        sm:grid-cols-2
        xl:grid-cols-3
      "
    >
      <StatsCard
        title="Active Calls"
        value={
          metrics.activeCalls
        }
      />

      <StatsCard
        title="Completed Today"
        value={
          metrics.completedCalls
        }
      />

      <StatsCard
        title="Unsuccessful Today"
        value={
          metrics.failedCalls
        }
      />

      <StatsCard
        title="AI Thinking"
        value={
          metrics.thinkingCalls
        }
      />

      <StatsCard
        title="AI Speaking"
        value={
          metrics.speakingCalls
        }
      />

      <StatsCard
        title="Queued Calls"
        value={
          metrics.queuedCalls
        }
      />
    </div>
  );
}