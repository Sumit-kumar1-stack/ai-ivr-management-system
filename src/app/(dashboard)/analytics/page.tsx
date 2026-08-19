"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  PhoneCall,
  CheckCircle2,
  XCircle,
  BarChart3,
  TrendingUp
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/axios";

export default function AnalyticsPage() {
  // Fetch real global dashboard metrics
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const { data } = await api.get("/api/dashboard/metrics");
      return data.data;
    },
    refetchInterval: 10000, // reload every 10 seconds for real-time tracking
  });

  const completed = data?.completedCalls ?? 0;
  const failed = data?.failedCalls ?? 0;
  const total = completed + failed;

  const successRate = total > 0
    ? Math.round((completed / total) * 100)
    : 100;

  const failureRate = total > 0
    ? Math.round((failed / total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="border-b pb-5 border-slate-200/80">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Analytics Hub
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time system throughput and communication performance analytics.
        </p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Calculating metrics...
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Managed Sessions
                </CardTitle>
                <PhoneCall size={16} className="text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800">{total}</div>
                <p className="text-[10px] text-slate-400 mt-1">Completed + Failed calls today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Call Success Rate
                </CardTitle>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800">{successRate}%</div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{ width: `${successRate}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Call Failure Rate
                </CardTitle>
                <XCircle size={16} className="text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800">{failureRate}%</div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-rose-500 h-1.5 rounded-full"
                    style={{ width: `${failureRate}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Active Concurrency
                </CardTitle>
                <Activity size={16} className="text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800">
                  {data?.activeCalls ?? 0}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Sessions currently executing</p>
              </CardContent>
            </Card>
          </div>

          {/* Visualization Section */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {"Today's Session Distribution"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
                {total === 0 ? (
                  <p className="text-sm text-slate-400">No session data available for today</p>
                ) : (
                  <div className="w-full max-w-[280px] space-y-4">
                    {/* Progress Bar representation */}
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>Successful Connections</span>
                        <span>{completed} ({successRate}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className="bg-emerald-500 h-3 rounded-full" style={{ width: `${successRate}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>Failed / Unanswered</span>
                        <span>{failed} ({failureRate}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className="bg-rose-500 h-3 rounded-full" style={{ width: `${failureRate}%` }} />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                      <span>Total Sessions Attempted:</span>
                      <span className="font-bold text-slate-700">{total}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Operational Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 min-h-[300px] flex flex-col justify-center">
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 border border-blue-100 text-blue-600">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Queue Latency</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Nominal (&lt;150ms worker dispatch delay)</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                    <BarChart3 size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">AI Speech Processing</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Optimal (&lt;450ms Deepgram/Gemini turn-taking RTT)</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Concurrency Guard</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Active (enforcing subscription limits safely)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}