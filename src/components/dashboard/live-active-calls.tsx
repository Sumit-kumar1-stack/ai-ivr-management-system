"use client";

import { useDashboardStore } from "@/store/dashboard.store";

import ConversationCard from "./conversation-card";

export default function LiveActiveCalls() {
  const calls = useDashboardStore(
    (s) => s.activeCalls
  );

  return (
    <div className="rounded-xl border p-6">
      <h2 className="mb-5 font-bold">
        Live Calls
      </h2>

      <div className="space-y-5">
        {calls.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No Active Calls
          </div>
        ) : (
          calls.map((call) => (
            <ConversationCard
              key={call.id}
              call={call}
            />
          ))
        )}
      </div>
    </div>
  );
}