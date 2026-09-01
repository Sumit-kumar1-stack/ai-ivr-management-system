"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle2,
  XCircle,
  BarChart3,
  TrendingUp,
  Clock,
  RefreshCw,
  Filter,
  Calendar,
  Layers,
  Radio,
  Server,
  Megaphone,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TabKey = "overview" | "inbound" | "outbound" | "campaigns";
type RangeKey = "today" | "7d" | "30d";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [timeRange, setTimeRange] = useState<RangeKey>("7d");
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [runtimeFilter, setRuntimeFilter] = useState<string>("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["analytics-data", activeTab, timeRange, providerFilter, runtimeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        tab: activeTab,
        range: timeRange,
      });
      if (providerFilter) params.set("provider", providerFilter);
      if (runtimeFilter) params.set("runtime", runtimeFilter);

      const res = await fetch(`/api/analytics?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load analytics");
      }
      return json.data;
    },
    refetchInterval: 30000,
  });

  const formatSeconds = (sec?: number) => {
    if (!sec && sec !== 0) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-5 border-slate-200/80">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Analytics & Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time operational metrics, telephony throughput, and campaign performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {(["today", "7d", "30d"] as RangeKey[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  timeRange === r
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {r === "today" ? "Today" : r === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200">
        {[
          { id: "overview", label: "System Overview", icon: BarChart3 },
          { id: "inbound", label: "Inbound Voice", icon: PhoneIncoming },
          { id: "outbound", label: "Outbound Voice", icon: PhoneOutgoing },
          { id: "campaigns", label: "Campaigns", icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabKey)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 gap-2">
          <RefreshCw size={18} className="animate-spin text-blue-500" />
          Loading analytics data...
        </div>
      ) : null}

      {/* OVERVIEW TAB */}
      {!isLoading && activeTab === "overview" && data && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Calls
                </CardTitle>
                <PhoneCall size={16} className="text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.totalCalls ?? 0}</div>
                <p className="text-xs text-slate-400 mt-1">Across all channels in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Answer Rate
                </CardTitle>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.answerRate ?? 0}%</div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{ width: `${data.kpis?.answerRate ?? 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Completion Rate
                </CardTitle>
                <TrendingUp size={16} className="text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.completionRate ?? 0}%</div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${data.kpis?.completionRate ?? 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Avg Duration
                </CardTitle>
                <Clock size={16} className="text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatSeconds(data.kpis?.avgDurationSeconds)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Total: {formatSeconds(data.kpis?.totalDurationSeconds)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown & Distribution Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Direction Split */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Direction Distribution</CardTitle>
                <CardDescription>Inbound incoming calls vs outbound campaign calls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <PhoneIncoming size={14} className="text-blue-500" /> Inbound
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.breakdowns?.direction?.inbound ?? 0}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${
                        data.kpis?.totalCalls > 0
                          ? ((data.breakdowns?.direction?.inbound ?? 0) / data.kpis.totalCalls) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm pt-2">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <PhoneOutgoing size={14} className="text-emerald-500" /> Outbound
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.breakdowns?.direction?.outbound ?? 0}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{
                      width: `${
                        data.kpis?.totalCalls > 0
                          ? ((data.breakdowns?.direction?.outbound ?? 0) / data.kpis.totalCalls) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Runtime Split */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Runtime Execution Tier</CardTitle>
                <CardDescription>Deterministic Standard IVR vs Generative Premium Tier</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <Server size={14} className="text-slate-600" /> Standard (Fastpath / Cascaded)
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.breakdowns?.runtime?.standard ?? 0}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-slate-700 h-2 rounded-full"
                    style={{
                      width: `${
                        data.kpis?.totalCalls > 0
                          ? ((data.breakdowns?.runtime?.standard ?? 0) / data.kpis.totalCalls) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm pt-2">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <Activity size={14} className="text-purple-500" /> Premium / Hybrid (Gemini Live)
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.breakdowns?.runtime?.premium ?? 0}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{
                      width: `${
                        data.kpis?.totalCalls > 0
                          ? ((data.breakdowns?.runtime?.premium ?? 0) / data.kpis.totalCalls) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* INBOUND TAB */}
      {!isLoading && activeTab === "inbound" && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Inbound Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.totalInbound ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Answer Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.answerRate ?? 0}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{data.kpis?.completedInbound ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Avg Inbound Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatSeconds(data.kpis?.avgDurationSeconds)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Provider distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Telephony Providers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(data.distributions?.byProvider ?? {}).map(([p, count]) => (
                  <div key={p} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                    <span className="font-medium text-slate-700">{p}</span>
                    <Badge variant="outline">{count as number} calls</Badge>
                  </div>
                ))}
                {Object.keys(data.distributions?.byProvider ?? {}).length === 0 && (
                  <p className="text-sm text-slate-400">No provider calls recorded in this timeframe.</p>
                )}
              </CardContent>
            </Card>

            {/* Duration Buckets */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Call Duration Buckets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">&lt; 30 Seconds</span>
                  <span className="font-semibold text-slate-800">{data.distributions?.durationBuckets?.under30s ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">30s – 1 Minute</span>
                  <span className="font-semibold text-slate-800">{data.distributions?.durationBuckets?.under1m ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">1 – 3 Minutes</span>
                  <span className="font-semibold text-slate-800">{data.distributions?.durationBuckets?.under3m ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">&gt; 3 Minutes</span>
                  <span className="font-semibold text-slate-800">{data.distributions?.durationBuckets?.over3m ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* OUTBOUND TAB */}
      {!isLoading && activeTab === "outbound" && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Outbound Attempts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.totalAttempts ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Connection Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{data.kpis?.connectionRate ?? 0}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{data.kpis?.completedOutbound ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Avg Call Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatSeconds(data.kpis?.avgDurationSeconds)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Campaign comparison table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Active Campaign Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                    <tr>
                      <th className="py-3 px-4">Campaign</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Attempted</th>
                      <th className="py-3 px-4">Connected</th>
                      <th className="py-3 px-4">Completed</th>
                      <th className="py-3 px-4">Conn %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.campaignComparisons ?? []).map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{c.status}</Badge>
                        </td>
                        <td className="py-3 px-4">{c.attempted}</td>
                        <td className="py-3 px-4">{c.connected}</td>
                        <td className="py-3 px-4 text-emerald-600 font-medium">{c.completed}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{c.connectionRate}%</td>
                      </tr>
                    ))}
                    {(data.campaignComparisons ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                          No outbound campaigns found for this timeframe.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CAMPAIGNS TAB */}
      {!isLoading && activeTab === "campaigns" && data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Campaign Operations & Compliance</CardTitle>
            <CardDescription>Aggregated performance and execution status across campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                  <tr>
                    <th className="py-3 px-4">Campaign Name</th>
                    <th className="py-3 px-4">Governance</th>
                    <th className="py-3 px-4">Tier</th>
                    <th className="py-3 px-4">Channels</th>
                    <th className="py-3 px-4">Audience</th>
                    <th className="py-3 px-4">Attempted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.campaigns ?? []).map((camp: any) => (
                    <tr key={camp.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-medium text-slate-900">{camp.name}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={camp.status === "APPROVED" ? "default" : "secondary"}
                          className={camp.status === "APPROVED" ? "bg-emerald-600" : ""}
                        >
                          {camp.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{camp.tier}</Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {(camp.channels ?? []).join(", ") || "VOICE"}
                      </td>
                      <td className="py-3 px-4 font-semibold">{camp.audienceSize}</td>
                      <td className="py-3 px-4">{camp.attempted}</td>
                    </tr>
                  ))}
                  {(data.campaigns ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                        No communication campaigns found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}