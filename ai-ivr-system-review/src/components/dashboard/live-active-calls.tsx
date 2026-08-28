"use client";

import { useDashboardStore } from "@/store/dashboard.store";

import ConversationCard from "./conversation-card";

export default function LiveActiveCalls() {
  const calls = useDashboardStore(
    (s) => s.activeCalls
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm shadow-slate-100/50">
      <h2 className="mb-5 font-bold text-slate-800 text-xs uppercase tracking-wider">
        Live Active Calls
      </h2>

      <div className="space-y-4">
        {calls.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 bg-slate-50/50">
            No active calls at this moment
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