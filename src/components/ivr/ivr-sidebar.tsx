"use client";

import { useEffect } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/axios";
import { useFlow } from "@/features/ivr/use-flow";
import { useFlows } from "@/features/ivr/use-flows";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useIVRBuilder } from "./ivr-builder-context";
import type { IVRFlow, IVRFlowVersionSummary } from "./types";

const nodePalette = [
  { group: "Entry", nodes: [{ label: "Start", kind: "START" }, { label: "Greeting", kind: "GREETING" }] },
  { group: "Input & conversation", nodes: [{ label: "Language Selection", kind: "HYBRID_MENU" }, { label: "DTMF Menu", kind: "DTMF_MENU" }, { label: "Hybrid Menu", kind: "HYBRID_MENU" }, { label: "AI Conversation", kind: "AI_CONVERSATION" }, { label: "Prompt / Message", kind: "SEND_INFORMATION" }, { label: "Collect Field", kind: "AUTH_GATE" }] },
  { group: "Routing", nodes: [{ label: "Intent Router", kind: "CONDITION" }, { label: "Condition", kind: "CONDITION" }] },
  { group: "Knowledge & action", nodes: [{ label: "Knowledge Search", kind: "KNOWLEDGE" }, { label: "Authentication", kind: "AUTH_GATE" }, { label: "Business Tool", kind: "ACTION" }] },
  { group: "Human & control", nodes: [{ label: "Agent Transfer", kind: "HUMAN_TRANSFER" }, { label: "Callback", kind: "CALLBACK" }, { label: "Business Hours", kind: "BUSINESS_HOURS" }, { label: "End", kind: "END_CALL" }] },
] as const;

export default function IVRSidebar() {
  const router = useRouter();
  const { data: flows = [] } = useFlows();

  const {
    selectedFlow,
    setSelectedFlow,
    setSelectedPublishedVersionId,
    setFlowName,
    setCampaignId,
    resetDraft,
    templates,
    resourceCatalog,
    builderContext,
    saveState,
    replaceGraph,
    applyTemplate,
    setMode,
    setSaveState,
  } = useIVRBuilder();

  const { data: selectedFlowDetails } = useFlow(selectedFlow);

  useEffect(() => {
    if (!selectedFlowDetails) return;
    replaceGraph({
      nodes: Array.isArray(selectedFlowDetails.nodes) ? selectedFlowDetails.nodes : [],
      edges: Array.isArray(selectedFlowDetails.edges) ? selectedFlowDetails.edges : [],
    });
    setFlowName(selectedFlowDetails.name);
    setCampaignId(selectedFlowDetails.campaignId ?? "");
    setSelectedPublishedVersionId(null);
    setMode("MANUAL");
    setSaveState("SAVED");
    // The editor should load only when the selected saved-flow identity changes;
    // depending on query object references here would overwrite local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlowDetails?.id]);

  const catalogSummary = [
    `${resourceCatalog?.knowledgeDocuments.length ?? 0} knowledge docs`,
    `${resourceCatalog?.actions.length ?? 0} actions`,
    `${resourceCatalog?.transferDestinations.length ?? 0} transfer destinations`,
  ];

  const versionHistory: IVRFlowVersionSummary[] = selectedFlowDetails?.versions ?? [];
  const inboundProfileCapability = resourceCatalog?.inboundProfiles.find(
    profile => profile.id === builderContext.inboundProfileId
  )?.realtimeInputCapability;

  function confirmDiscardDraft(): boolean {
    if (saveState !== "UNSAVED" && saveState !== "FAILED") {
      return true;
    }

    return window.confirm("Discard unsaved IVR draft changes?");
  }

  async function loadVersion(versionId: string) {
    if (!selectedFlowDetails) {
      return;
    }

    if (!confirmDiscardDraft()) {
      return;
    }

    try {
      const { data } = await api.get(`/ivr-flows/versions/${versionId}`);

      if (!data?.success || !data.data) {
        throw new Error(data?.message ?? "IVR flow version could not be loaded");
      }

      replaceGraph({
        nodes: Array.isArray(data.data.nodes) ? data.data.nodes : [],
        edges: Array.isArray(data.data.edges) ? data.data.edges : [],
      });
      setSelectedFlow(data.data.flowId);
      setSelectedPublishedVersionId(data.data.id);
      setFlowName(selectedFlowDetails.name);
      setCampaignId(selectedFlowDetails.campaignId ?? "");
      setMode("MANUAL");
      toast.success(`Loaded published v${data.data.versionNumber} into a new editable draft.`);
    } catch (versionError) {
      toast.error(
        versionError instanceof Error
          ? versionError.message
          : "IVR flow version could not be loaded"
      );
    }
  }

  function dragStart(e: React.DragEvent, kind: string) {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="w-80 overflow-y-auto border-r border-slate-200/80 bg-slate-50/50 p-5">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Builder Context
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-900">
          {builderContext.kind === "CAMPAIGN"
            ? "Campaign-bound flow"
            : builderContext.kind === "INBOUND_PROFILE"
              ? "Inbound profile-bound flow"
              : "Standalone flow"}
        </div>
        <div className="mt-1 space-y-1 text-xs leading-5 text-slate-500">
          {builderContext.campaignId && <div>Campaign ID: {builderContext.campaignId}</div>}
          {builderContext.inboundProfileId && (
            <div>Inbound Profile ID: {builderContext.inboundProfileId}</div>
          )}
          {builderContext.returnTo && <div>Return to: {builderContext.returnTo}</div>}
        </div>
        {inboundProfileCapability && inboundProfileCapability.support !== "SUPPORTED" ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
            <span className="font-semibold">{inboundProfileCapability.support}: </span>
            {inboundProfileCapability.message}
          </div>
        ) : null}
        {builderContext.kind === "STANDALONE" && (resourceCatalog?.inboundProfiles.length ?? 0) > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-700">Build for inbound profile</label>
            <select
              value=""
              onChange={event => {
                const inboundProfileId = event.target.value;
                if (!inboundProfileId || !confirmDiscardDraft()) {
                  return;
                }
                router.push(`/ivr-builder?inboundProfileId=${encodeURIComponent(inboundProfileId)}`);
              }}
              className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              <option value="">Choose an inbound profile</option>
              {resourceCatalog?.inboundProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                  {profile.provider && profile.inboundNumberMasked
                    ? ` — ${profile.provider} · ${profile.inboundNumberMasked}`
                    : ""}
                  {profile.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>
        )}
        {resourceCatalog?.warnings.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {resourceCatalog.warnings.map(warning => (
              <Badge key={warning} variant="outline" className="h-auto whitespace-normal text-left">
                {warning}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Create Flow
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              Choose how to start
            </h3>
          </div>

          <Dialog>
            <DialogTrigger
              render={
                <Button size="sm" type="button" />
              }
            >
              New Flow
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>Create a new IVR flow</DialogTitle>
                <DialogDescription>
                  Start from AI, build manually, or load a safe editable template.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-3">
                <DialogClose
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirmDiscardDraft()) {
                          return;
                        }
                        resetDraft();
                        setMode("MANUAL");
                      }}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    />
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">Build manually</div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    Start with a clean editable draft and add nodes yourself.
                  </p>
                </DialogClose>

                <DialogClose
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirmDiscardDraft()) {
                          return;
                        }
                        resetDraft();
                        setMode("AI");
                      }}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    />
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">Generate with AI</div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    Switch to the AI panel and describe the journey you want.
                  </p>
                </DialogClose>

                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("ivr-template-gallery")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="text-sm font-semibold text-slate-900">Start from template</div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    Jump to the template gallery and load a safe starter flow.
                  </p>
                </button>
              </div>
              <div
                id="ivr-template-gallery"
                className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Templates
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {templates.map(template => (
                    <DialogClose
                      key={template.id}
                      render={
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirmDiscardDraft()) {
                              return;
                            }
                            applyTemplate(template.id);
                          }}
                          className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm transition hover:border-blue-300 hover:bg-blue-50"
                        />
                      }
                    >
                      <div className="font-semibold text-slate-900">{template.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {template.description}
                      </div>
                    </DialogClose>
                  ))}
                </div>
              </div>
              <DialogFooter className="justify-between">
                <div className="text-xs text-slate-500">
                  Builder context: {builderContext.kind.toLowerCase().replace("_", " ")}
                </div>
                <DialogClose
                  render={
                    <Button variant="outline" type="button">
                      Close
                    </Button>
                  }
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {catalogSummary.map(summary => (
            <Badge key={summary} variant="secondary">
              {summary}
            </Badge>
          ))}
        </div>
      </div>

      {selectedFlowDetails && versionHistory.length > 0 && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Version History
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                {selectedFlowDetails.name}
              </h3>
            </div>
            <Badge variant="secondary">{versionHistory.length} versions</Badge>
          </div>

          <div className="mt-3 space-y-2">
            {versionHistory.map((version: IVRFlowVersionSummary) => (
              <div key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Version {version.versionNumber}
                  </div>
                  <Badge variant={version.status === "PUBLISHED" ? "default" : "outline"}>
                    {version.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {version.publishedAt
                    ? `Published ${new Date(version.publishedAt).toLocaleDateString()}`
                    : `Updated ${new Date(version.updatedAt).toLocaleDateString()}`}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => void loadVersion(version.id)}
                >
                  Load as draft
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Saved Flows
      </h3>

      <div className="mb-8 space-y-2">
        {flows.length === 0 && <p className="py-2 text-xs text-slate-400">No saved flows found</p>}

        {flows.map((flow: IVRFlow) => (
          <button
            key={flow.id}
            onClick={() => {
              if (!confirmDiscardDraft()) {
                return;
              }
              setSelectedFlow(flow.id);
            }}
            className={`w-full rounded-lg border p-2.5 text-left text-xs font-semibold transition ${
              selectedFlow === flow.id
                ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {flow.name}
          </button>
        ))}
      </div>

      <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Conversation blocks
      </h3>

      <div className="space-y-5">
        {nodePalette.map(section => (
          <section key={section.group} aria-label={`${section.group} node palette`}>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{section.group}</h4>
            <div className="space-y-2.5">
              {section.nodes.map(node => (
                <div key={node.label} draggable onDragStart={e => dragStart(e, node.kind)} className="cursor-grab rounded-lg border border-slate-200/80 bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-100/50 transition hover:bg-slate-50 hover:text-slate-900 active:cursor-grabbing">
                  <div>{node.label}</div>
                  <div className="mt-1 text-[10px] font-medium text-slate-400">{node.kind}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
