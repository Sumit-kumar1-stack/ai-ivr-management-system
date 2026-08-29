"use client";

import { Pause, Play, RefreshCw, StopCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSocket } from "@/lib/socket";
import type { CampaignCapability } from "@/services/communication/campaign-capabilities";
import type { CommunicationCampaignDetailsDTO } from "@/types/communication-campaign-details";
import { OUTBOUND_REALTIME_EVENTS } from "@/types/communication-outbound-operations";

type CampaignStatus = CommunicationCampaignDetailsDTO["campaign"]["status"];
type RuntimeAction = "pause" | "resume" | "cancel";

interface AuthMeResponse {
  tenantId?: string | null;
  campaignCapabilities?: CampaignCapability[];
}

interface DetailsResponse {
  success: boolean;
  data?: CommunicationCampaignDetailsDTO;
  message?: string;
}

const realtimeEvents = Object.values(OUTBOUND_REALTIME_EVENTS);

export function getCampaignRuntimeActions(
  status: CampaignStatus,
  canManage: boolean
): RuntimeAction[] {
  if (!canManage) return [];
  if (status === "PAUSED") return ["resume", "cancel"];
  if (["RUNNING", "SCHEDULED", "DISPATCHED"].includes(status)) {
    return ["pause", "cancel"];
  }
  if (status === "QUEUED") return ["cancel"];
  return [];
}

export function shouldRefreshOutboundCampaign(
  event: string,
  payload: unknown,
  campaignId: string,
  tenantId: string | null
): boolean {
  if (!realtimeEvents.includes(event as typeof realtimeEvents[number])) return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return value.campaignId === campaignId &&
    Boolean(tenantId) &&
    value.tenantId === tenantId;
}

export async function requestCampaignRuntimeAction(
  campaignId: string,
  action: RuntimeAction,
  fetcher: typeof fetch = fetch,
  confirmAction: (message: string) => boolean = message => window.confirm(message)
): Promise<void> {
  if (action === "cancel" && !confirmAction(
    "Cancel this campaign? New outbound work will stop. Calls already in progress are not force-hung-up."
  )) return;

  const response = await fetcher(
    `/api/communication/campaigns/${encodeURIComponent(campaignId)}/${action}`,
    { method: "POST" }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message ?? `Campaign ${action} failed`);
  }
}

export default function CampaignOperationsPanel({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<CommunicationCampaignDetailsDTO | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState<RuntimeAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (background = false) => {
    const sequence = ++requestSequence.current;
    if (!background) setLoading(true);
    try {
      const [detailsResponse, authResponse] = await Promise.all([
        fetch(`/api/communication/campaigns/${encodeURIComponent(campaignId)}/details?page=1&pageSize=25`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const details = await detailsResponse.json() as DetailsResponse;
      const auth = authResponse.ok
        ? await authResponse.json() as AuthMeResponse
        : {};
      if (!detailsResponse.ok || !details.success || !details.data) {
        throw new Error(details.message ?? "Campaign operations could not be loaded");
      }
      if (sequence !== requestSequence.current) return;
      setData(details.data);
      setTenantId(auth.tenantId?.trim() || null);
      setCanManage(Boolean(auth.campaignCapabilities?.includes("CAMPAIGN_LAUNCH")));
      setError(null);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Campaign operations could not be loaded");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const listeners = realtimeEvents.map(event => {
      const listener = (payload: unknown) => {
        if (shouldRefreshOutboundCampaign(event, payload, campaignId, tenantId)) {
          void load(true);
        }
      };
      socket.on(event, listener);
      return { event, listener };
    });
    const reconnect = () => void load(true);
    socket.on("connect", reconnect);
    if (!socket.connected) socket.connect();
    return () => {
      for (const { event, listener } of listeners) socket.off(event, listener);
      socket.off("connect", reconnect);
    };
  }, [campaignId, load, tenantId]);

  async function act(action: RuntimeAction): Promise<void> {
    setMutating(action);
    try {
      await requestCampaignRuntimeAction(campaignId, action);
      await load(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Campaign action failed");
    } finally {
      setMutating(null);
    }
  }

  if (loading && !data) {
    return <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading outbound operations…</section>;
  }
  if (!data) {
    return <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error ?? "Campaign operations are unavailable."}</section>;
  }

  return (
    <CampaignOperationsView
      data={data}
      actions={getCampaignRuntimeActions(data.campaign.status, canManage)}
      mutating={mutating}
      error={error}
      onAction={action => void act(action)}
      onRefresh={() => void load(true)}
    />
  );
}

export function CampaignOperationsView({
  data,
  actions,
  mutating,
  error,
  onAction,
  onRefresh,
}: {
  data: CommunicationCampaignDetailsDTO;
  actions: RuntimeAction[];
  mutating: RuntimeAction | null;
  error: string | null;
  onAction: (action: RuntimeAction) => void;
  onRefresh: () => void;
}) {
  const { progress } = data;
  const kpis = [
    ["Progress", `${progress.progressPercent}%`],
    ["Processed / Total", `${progress.processedCount} / ${progress.totalRecipients}`],
    ["Remaining", progress.remainingCount],
    ["Answered", progress.answered],
    ["Completed", progress.completed],
    ["Failed", progress.failed + progress.providerError],
    ["Retries", progress.retryScheduled],
  ] as const;
  const lifecycle = [
    ["Queued", progress.queued], ["Requesting", progress.requesting],
    ["Ringing", progress.ringing], ["Answered", progress.answered],
    ["Completed", progress.completed], ["Busy", progress.busy],
    ["No Answer", progress.noAnswer], ["Rejected", progress.rejected],
    ["Invalid", progress.invalidNumber], ["Failed", progress.failed + progress.providerError],
    ["Canceled", progress.canceled],
  ] as const;

  return (
    <section className="mt-8 space-y-6 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Outbound operations</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">Campaign execution</h2>
            <CampaignStateBadge status={data.campaign.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {data.campaign.runtime ?? "Runtime pending"} · {data.campaign.channels.join(", ") || "No channels"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
            <RefreshCw size={15} /> Refresh
          </button>
          {actions.map(action => (
            <button
              key={action}
              type="button"
              disabled={mutating !== null}
              onClick={() => onAction(action)}
              className={action === "cancel"
                ? "inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                : "inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"}
            >
              {action === "pause" ? <Pause size={15} /> : action === "resume" ? <Play size={15} /> : <StopCircle size={15} />}
              {mutating === action ? "Working…" : formatLabel(action)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900">Lifecycle breakdown</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {lifecycle.map(([label, value]) => (
            <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{label}: {value}</span>
          ))}
        </div>
      </div>

      {(progress.transferred > 0 || progress.callbackRequested > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          <OutcomeCard label="Transferred" value={progress.transferred} />
          <OutcomeCard label="Callback requested" value={progress.callbackRequested} />
          <OutcomeCard label="Callback completed" value={progress.callbackCompleted} />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>{["Recipient", "Attempt", "Status", "Disposition", "Retry", "Transfer", "Callback", "Last Updated"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.attempts.map(attempt => (
              <tr key={attempt.id}>
                <td className="px-4 py-4 font-medium text-slate-900">{attempt.recipient}</td>
                <td className="px-4 py-4">#{attempt.attemptNumber}</td>
                <td className="px-4 py-4"><StatePill value={attempt.state} /></td>
                <td className="px-4 py-4"><StatePill value={attempt.disposition} /></td>
                <td className="px-4 py-4">
                  {attempt.retryState === "SCHEDULED"
                    ? `Scheduled · #${attempt.attemptNumber}${attempt.nextRetryAt ? ` · ${formatDate(attempt.nextRetryAt)}` : ""}`
                    : attempt.retryState === "EXHAUSTED" ? "Exhausted" : "—"}
                </td>
                <td className="px-4 py-4">{attempt.transferred ? "Transferred" : "—"}</td>
                <td className="px-4 py-4">{attempt.callbackCompleted ? "Completed" : attempt.callbackRequested ? "Requested" : "—"}</td>
                <td className="px-4 py-4 text-slate-500">{formatDate(attempt.updatedAt)}</td>
              </tr>
            ))}
            {data.attempts.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No outbound attempts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampaignStateBadge({ status }: { status: CampaignStatus }) {
  const tone = status === "COMPLETED"
    ? "bg-green-50 text-green-700"
    : status === "FAILED" || status === "CANCELLED"
      ? "bg-red-50 text-red-700"
      : status === "PAUSED"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{formatLabel(status)}</span>;
}

function StatePill({ value }: { value: string }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{formatLabel(value)}</span>;
}

function OutcomeCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-xs font-semibold text-blue-700">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div>;
}

function formatLabel(value: string): string {
  return value.toLowerCase().split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
