"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import IVRFlowReviewGraph from "@/components/ivr/ivr-flow-review-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/axios";

type ReviewItem = {
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "error";
  nodeId?: string | null;
};

type ReviewResponse = {
  flow: {
    id: string;
    name: string;
    description?: string | null;
    version: number;
    lifecycle: string;
    validationStatus: string;
    ownerUser?: { fullName?: string | null } | null;
    nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
    edges: Array<{ id: string; source: string; target: string; type?: string; sourceHandle?: string; targetHandle?: string; data?: Record<string, unknown> }>;
    submittedAt?: string | null;
    updatedAt: string;
    permissions?: { canApprove?: boolean; canReject?: boolean };
  };
  publishedVersion: {
    id: string;
    versionNumber: number;
    publishedAt: string | null;
    validationStatus: string;
  } | null;
  validation: {
    valid: boolean;
    errors: Array<{
      code: string;
      nodeId: string | null;
      field: string | null;
      message: string;
      severity: "ERROR" | "WARNING" | "INFO";
    }>;
    warnings: Array<{
      code: string;
      nodeId: string | null;
      field: string | null;
      message: string;
      severity: "ERROR" | "WARNING" | "INFO";
    }>;
    issues: Array<{
      code: string;
      nodeId: string | null;
      field: string | null;
      message: string;
      severity: "ERROR" | "WARNING" | "INFO";
    }>;
  };
  simulation: {
    validation: { valid: boolean };
    currentNodeId: string | null;
    resultingNodeId: string | null;
    transition: string | null;
    responsePreview: string | null;
    knowledgeScopeSummary: string | null;
    warnings: string[];
    trace: string[];
  };
  usage: Array<{
    id: string;
    name: string;
    active: boolean;
    provider: string | null;
    inboundNumberMasked: string | null;
    voiceRuntime: string;
    ivrFlowVersionId: string | null;
  }>;
  review: {
    versionLabel: string | null;
    publishedVersionLabel: string | null;
    noMaterialChanges: boolean;
    submissionSummary: string;
    nodeChanges: ReviewItem[];
    edgeChanges: ReviewItem[];
    structureFindings: ReviewItem[];
    runtimeFindings: ReviewItem[];
    knowledgeFindings: ReviewItem[];
    toolFindings: ReviewItem[];
    authFindings: ReviewItem[];
    transferFindings: ReviewItem[];
    callbackFindings: ReviewItem[];
    validationFindings: ReviewItem[];
    simulationFindings: ReviewItem[];
    usageFindings: ReviewItem[];
  };
};

export default function IvrFlowApprovalReviewPage() {
  const params = useParams<{ id: string }>();
  const flowId = params?.id;
  const queryClient = useQueryClient();
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ivr-flow-review", flowId],
    enabled: Boolean(flowId),
    queryFn: async () => (await api.get(`/ivr-flows/${encodeURIComponent(flowId ?? "")}/review`)).data.data as ReviewResponse,
  });

  const review = data?.review;
  const nodeCount = data?.flow.nodes.length ?? 0;
  const edgeCount = data?.flow.edges.length ?? 0;

  const graphFocusNodeId = useMemo(() => focusedNodeId, [focusedNodeId]);

  async function decide(action: "approve" | "reject") {
    if (!flowId) {
      return;
    }

    const reason = action === "reject" ? window.prompt("Reason for rejection")?.trim() : undefined;
    if (action === "reject" && !reason) {
      return;
    }

    try {
      await api.post(`/ivr-flows/${encodeURIComponent(flowId)}/governance`, { action, reason });
      toast.success(action === "approve" ? "IVR flow approved" : "IVR flow rejected");
      setFocusedNodeId(null);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["ivr-flows"] }),
        queryClient.invalidateQueries({ queryKey: ["ivr-flow-review", flowId] }),
      ]);
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? "The IVR decision could not be recorded.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,78,134,0.95)_52%,rgba(37,99,235,0.88))] p-8 text-white md:grid-cols-[1.3fr_0.7fr] md:p-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              <ShieldCheck size={14} />
              Approver review
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
              {data?.flow.name ?? "IVR flow review"}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/78 md:text-base">
              Review the graph, exact draft-vs-published changes, deterministic validation, simulation preview, and live usage before deciding.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur md:self-end">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
              <Eye size={14} />
              Review snapshot
            </div>
            <p className="mt-2 text-3xl font-semibold">{nodeCount} nodes</p>
            <p className="text-sm text-white/70">{edgeCount} edges · {review?.publishedVersionLabel ?? "no published baseline"}</p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link href="/approvals" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={15} />
          Back to approvals
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void decide("reject")} disabled={!data?.flow.permissions?.canReject}>
            <XCircle size={15} className="mr-2" />
            Reject
          </Button>
          <Button onClick={() => void decide("approve")} disabled={!data?.flow.permissions?.canApprove}>
            <CheckCircle2 size={15} className="mr-2" />
            Approve
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading IVR flow review...</p>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          The IVR flow review could not be loaded.
        </div>
      ) : data ? (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <IVRFlowReviewGraph nodes={data.flow.nodes as never} edges={data.flow.edges as never} focusNodeId={graphFocusNodeId} />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Draft vs published changes</h2>
                  <p className="mt-1 text-sm text-slate-500">{review?.submissionSummary ?? "No change summary available."}</p>
                </div>
                <Badge variant={review?.noMaterialChanges ? "default" : "secondary"}>
                  {review?.noMaterialChanges ? "No material changes" : "Changes present"}
                </Badge>
              </div>
              {renderChangeGroup("Node changes", review?.nodeChanges ?? [], setFocusedNodeId)}
              {renderChangeGroup("Edge changes", review?.edgeChanges ?? [], setFocusedNodeId)}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              {renderReviewCard("Structure", review?.structureFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Runtime", review?.runtimeFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Knowledge", review?.knowledgeFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Tools", review?.toolFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Authentication", review?.authFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Transfer", review?.transferFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Callback", review?.callbackFindings ?? [], setFocusedNodeId)}
              {renderReviewCard("Usage", review?.usageFindings ?? [], setFocusedNodeId)}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Validation</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={data.validation.valid ? "default" : "destructive"}>{data.validation.valid ? "Valid" : "Invalid"}</Badge>
                <Badge variant="secondary">Errors: {data.validation.errors.length}</Badge>
                <Badge variant="secondary">Warnings: {data.validation.warnings.length}</Badge>
                <Badge variant="secondary">Info: {data.validation.issues.filter(issue => issue.severity === "INFO").length}</Badge>
              </div>
              <div className="mt-4 space-y-2">
                {renderItems(data.review.validationFindings, setFocusedNodeId)}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Simulation</h2>
              <p className="mt-1 text-sm text-slate-500">Safe dry-run preview of the current draft.</p>
              <div className="mt-3 space-y-2">
                {renderItems(data.review.simulationFindings, setFocusedNodeId)}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Published usage</h2>
              <p className="mt-1 text-sm text-slate-500">Where this IVR flow is currently bound in tenant-scoped runtime contexts.</p>
              <div className="mt-3 space-y-2">
                {renderItems(data.review.usageFindings, setFocusedNodeId)}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Version metadata</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-600">
                <div><dt className="font-semibold text-slate-900">Draft version</dt><dd>{data.review.versionLabel}</dd></div>
                <div><dt className="font-semibold text-slate-900">Published baseline</dt><dd>{data.review.publishedVersionLabel ?? "None"}</dd></div>
                <div><dt className="font-semibold text-slate-900">Lifecycle</dt><dd>{data.flow.lifecycle.replaceAll("_", " ")}</dd></div>
                <div><dt className="font-semibold text-slate-900">Validation state</dt><dd>{data.flow.validationStatus.replaceAll("_", " ")}</dd></div>
                <div><dt className="font-semibold text-slate-900">Owner</dt><dd>{data.flow.ownerUser?.fullName ?? "Unknown"}</dd></div>
                <div><dt className="font-semibold text-slate-900">Submitted</dt><dd>{data.flow.submittedAt ? new Date(data.flow.submittedAt).toLocaleString() : "Not submitted"}</dd></div>
                <div><dt className="font-semibold text-slate-900">Last updated</dt><dd>{new Date(data.flow.updatedAt).toLocaleString()}</dd></div>
                <div><dt className="font-semibold text-slate-900">Published version state</dt><dd>{data.publishedVersion ? `v${data.publishedVersion.versionNumber} · ${data.publishedVersion.validationStatus.replaceAll("_", " ")}` : "None"}</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function renderReviewCard(title: string, items: ReviewItem[], setFocusedNodeId?: (nodeId: string) => void) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      <div className="mt-3 space-y-2">{renderItems(items, setFocusedNodeId)}</div>
    </section>
  );
}

function renderChangeGroup(title: string, items: ReviewItem[], setFocusedNodeId: (nodeId: string) => void) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {renderItems(items, setFocusedNodeId)}
      </div>
    </div>
  );
}

function renderItems(items: ReviewItem[], setFocusedNodeId?: (nodeId: string) => void) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No items to review.</div>;
  }

  return items.map(item => (
    <button
      key={`${item.title}-${item.detail}`}
      type="button"
      onClick={() => item.nodeId && setFocusedNodeId?.(item.nodeId)}
      className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-2">
        <Badge variant={badgeVariant(item.tone)}>{item.tone.toUpperCase()}</Badge>
        <span className="text-sm font-semibold text-slate-900">{item.title}</span>
      </div>
      <div className="mt-2 text-sm text-slate-600">{item.detail}</div>
      {item.nodeId && <div className="mt-2 text-xs text-slate-500">Node: {item.nodeId}</div>}
    </button>
  ));
}

function badgeVariant(tone: ReviewItem["tone"]): "default" | "secondary" | "destructive" {
  if (tone === "success") return "default";
  if (tone === "error") return "destructive";
  return "secondary";
}
