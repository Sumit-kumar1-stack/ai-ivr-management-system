"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Eye, FileText, XCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/axios";
import type { CommunicationCampaignDTO } from "@/types/communication-campaign";
import { getPendingCampaignApprovals } from "./approval-queue";

type PendingIvrFlow = {
  id: string;
  name: string;
  version: number;
  lifecycle: string;
  updatedAt: string;
  submittedAt?: string | null;
  ownerUser?: { fullName?: string } | null;
  submittedByUser?: { fullName?: string } | null;
  validationStatus: string;
  permissions?: { canApprove?: boolean; canReject?: boolean };
};

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { data: campaigns, isError, isLoading } = useQuery({
    queryKey: ["communication-campaigns"],
    queryFn: async () => (await api.get("/communication/campaigns")).data.data as CommunicationCampaignDTO[],
  });
  const { data: ivrFlows = [] } = useQuery({
    queryKey: ["ivr-flows", "approvals"],
    queryFn: async () => (await api.get("/ivr-flows")).data.data as PendingIvrFlow[],
  });

  const pendingCampaigns = getPendingCampaignApprovals(campaigns ?? []);
  const pendingIvrFlows = ivrFlows.filter(flow => flow.lifecycle === "PENDING_APPROVAL" && (flow.permissions?.canApprove || flow.permissions?.canReject));

  async function decideIvrFlow(flowId: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Reason for rejection")?.trim() : undefined;
    if (action === "reject" && !reason) return;

    try {
      await api.post(`/ivr-flows/${flowId}/governance`, { action, reason });
      toast.success(
        action === "approve"
          ? "IVR flow approved! An authorized publisher can now release it under IVR Flows."
          : "IVR flow rejected"
      );
      await queryClient.invalidateQueries({ queryKey: ["ivr-flows"] });
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? "The IVR decision could not be recorded.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,78,134,0.95)_52%,rgba(37,99,235,0.88))] p-8 text-white md:grid-cols-[1.3fr_0.7fr] md:p-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Checker workspace</p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Approvals</h1>
            <p className="max-w-2xl text-sm leading-6 text-white/78 md:text-base">
              Review submitted campaign and IVR artifacts. This workspace never edits authoring content or deploys a release.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur md:self-end">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
              <ClipboardCheck size={14} />
              Pending review
            </div>
            <p className="mt-2 text-3xl font-semibold">{pendingCampaigns.length + pendingIvrFlows.length}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Submitted campaigns</h2>
          <p className="mt-1 text-sm text-slate-500">Only campaigns this account is permitted to decide are shown.</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading approval queue...</p>
        ) : isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load the approval queue.</div>
        ) : pendingCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No campaigns are awaiting your approval.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pendingCampaigns.map(campaign => (
              <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{campaign.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{campaign.audienceSourceName}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Pending approval
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/communication/campaigns/new/summary?campaign=${encodeURIComponent(campaign.id)}`} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    <ClipboardCheck size={15} />
                    Review
                  </Link>
                  <Link href={`/communication/campaigns/${encodeURIComponent(campaign.id)}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Eye size={15} />
                    View
                  </Link>
                </div>
                {campaign.permissions?.selfApprovalBlocked && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                    You cannot approve your own submission. A different eligible approver must make the decision.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">IVR flow approvals</h2>
          <p className="mt-1 text-sm text-slate-500">Submitted graph content is read-only. Review validation, simulation, usage, and exact changes before deciding.</p>
        </div>
        {pendingIvrFlows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">No IVR flows are awaiting your decision.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pendingIvrFlows.map(flow => (
              <article key={flow.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">{flow.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Draft v{flow.version} · created by {flow.ownerUser?.fullName ?? "Unknown"} · validation {flow.validationStatus.toLowerCase()}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Submitted by {flow.submittedByUser?.fullName ?? "Unknown"} · {flow.submittedAt ? new Date(flow.submittedAt).toLocaleString() : new Date(flow.updatedAt).toLocaleString()}
                </p>
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  Review includes graph, validation result, simulation preview, usage visibility, and change metadata. Authoring remains unavailable here.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/approvals/${encodeURIComponent(flow.id)}`} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    <FileText size={15} />
                    Review details
                  </Link>
                  <Link href="/ivr-flows" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Eye size={15} />
                    View release details
                  </Link>
                  {flow.permissions?.canApprove && (
                    <button type="button" onClick={() => void decideIvrFlow(flow.id, "approve")} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                      <CheckCircle2 size={15} />
                      Approve
                    </button>
                  )}
                  {flow.permissions?.canReject && (
                    <button type="button" onClick={() => void decideIvrFlow(flow.id, "reject")} className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                      <XCircle size={15} />
                      Reject
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
