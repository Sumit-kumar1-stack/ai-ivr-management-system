"use client";

import StatsCard from "@/components/layout/stats-card";

import {
useDashboardStore
}
from "@/store/dashboard.store";

export default function LiveMetrics(){

const metrics=
useDashboardStore(
s=>s.metrics
);

return(

<div className="grid grid-cols-3 gap-5">

<StatsCard
title="Active Calls"
value={metrics.activeCalls}
/>

<StatsCard
title="Completed"
value={metrics.completedCalls}
/>

<StatsCard
title="Failed"
value={metrics.failedCalls}
/>

<StatsCard
title="Thinking"
value={metrics.thinkingCalls}
/>

<StatsCard
title="Speaking"
value={metrics.speakingCalls}
/>

<StatsCard
title="Queued"
value={metrics.queuedCalls}
/>

</div>

);

}