"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  BookOpen,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import CampaignWizardStepper, {
  buildCampaignWizardSteps,
  getCampaignWizardStepCount,
} from "./campaign-wizard-stepper";

import {
  api,
} from "@/lib/axios";

import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

import type {
  KnowledgeDocumentSummary,
} from "@/features/knowledge/knowledge.types";

import {
  filterSelectableKnowledgeDocuments,
} from "./campaign-knowledge-selection.helpers";

interface CampaignApiResponse {
  success: boolean;
  data?: CommunicationCampaignDTO;
  message?: string;
}

interface KnowledgeApiResponse {
  success: boolean;
  data?: KnowledgeDocumentSummary[];
  message?: string;
}

interface UpdateCampaignApiResponse {
  success: boolean;
  data?: CommunicationCampaignDTO;
  message?: string;
}

export default function CampaignKnowledgeSelectionScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaign");

  const [campaign, setCampaign] = useState<CommunicationCampaignDTO | null>(null);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(campaignId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    const resolvedCampaignId = campaignId;
    let active = true;

    async function load() {
      setLoading(true);

      try {
        const [campaignResponse, knowledgeResponse] = await Promise.all([
          api.get<CampaignApiResponse>(
            `/communication/campaigns/${encodeURIComponent(resolvedCampaignId)}`
          ),
          api.get<KnowledgeApiResponse>("/knowledge"),
        ]);

        if (!campaignResponse.data.success || !campaignResponse.data.data) {
          throw new Error(campaignResponse.data.message ?? "Campaign could not be loaded");
        }

        if (!knowledgeResponse.data.success || !knowledgeResponse.data.data) {
          throw new Error(knowledgeResponse.data.message ?? "Knowledge documents could not be loaded");
        }

        if (!active) {
          return;
        }

        setCampaign(campaignResponse.data.data);
        setKnowledgeDocuments(knowledgeResponse.data.data);
        setSelectedKnowledgeDocumentIds(campaignResponse.data.data.knowledgeDocumentIds ?? []);
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Knowledge step could not be loaded");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [campaignId]);

  const availableDocuments = useMemo(() => {
    return filterSelectableKnowledgeDocuments(
      knowledgeDocuments,
      selectedKnowledgeDocumentIds
    );
  }, [knowledgeDocuments, selectedKnowledgeDocumentIds]);

  const selectedDocuments = useMemo(() => {
    return availableDocuments.filter(document => selectedKnowledgeDocumentIds.includes(document.id));
  }, [availableDocuments, selectedKnowledgeDocumentIds]);

  function goBack() {
    if (campaignId) {
      router.push(getKnowledgeBackHref(campaignId));
      return;
    }

    router.push("/communication/campaigns/new/audience");
  }

  async function continueToChannels() {
    if (!campaignId || saving) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { data } = await api.patch<UpdateCampaignApiResponse>(
        `/communication/campaigns/${encodeURIComponent(campaignId)}`,
        {
          knowledgeDocumentIds: selectedKnowledgeDocumentIds,
        }
      );

      if (!data.success || !data.data) {
        throw new Error(data.message ?? "Campaign knowledge could not be saved");
      }

      router.push(getKnowledgeContinueHref(campaignId));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Campaign knowledge could not be saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        Loading campaign knowledge...
      </div>
    );
  }

  if (!campaignId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Save the audience first, then attach knowledge to the campaign.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200/70 bg-[#f9f9ff]/90 px-4 py-5 backdrop-blur-xl md:px-8 xl:px-[82px]">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Campaign Builder
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-900">
              Campaign Knowledge
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Step 2 of {getCampaignWizardStepCount("production")} - Knowledge selection
            </p>
          </div>

          <CampaignWizardStepper
            steps={buildCampaignWizardSteps("production", 2)}
          />
        </div>
      </header>

      <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,78,134,0.95)_52%,rgba(37,99,235,0.88))] p-8 text-white md:grid-cols-[1.3fr_0.7fr] md:p-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Campaign Builder
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                Campaign Knowledge
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/78 md:text-base">
                Select approved knowledge the AI may use for{" "}
                <strong>{campaign?.name ?? "this campaign"}</strong>.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={goBack}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/15"
              >
                <ArrowLeft size={16} />
                Back to Audience
              </button>
              <button
                type="button"
                onClick={continueToChannels}
                disabled={saving || selectedKnowledgeDocumentIds.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Continue to Channels"}
                {!saving && <ArrowRight size={16} />}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:self-end">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                <BookOpen size={14} />
                Knowledge Library
              </div>
              <p className="mt-2 text-sm leading-6 text-white/85">
                Manage reusable documents in the sidebar Knowledge module.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                <CheckCircle2 size={14} />
                Selected
              </div>
              <p className="mt-2 text-sm leading-6 text-white/85">
                {selectedKnowledgeDocumentIds.length} document
                {selectedKnowledgeDocumentIds.length === 1 ? "" : "s"} selected
              </p>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Available Knowledge
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select approved knowledge the AI may use for this campaign.
              </p>
            </div>
            <a
              href="/knowledge"
              className="text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              Manage Knowledge Library
            </a>
          </div>

          <div className="mt-6 space-y-3">
            {availableDocuments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No knowledge documents are available yet.
              </div>
            ) : (
              availableDocuments.map(document => {
                const selected = selectedKnowledgeDocumentIds.includes(document.id);
                const canAttach = document.status === "ACTIVE" && document.isIndexed;
                const canToggle = canAttach || selected;

                return (
                  <label
                    key={document.id}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                      selected
                        ? "border-blue-500 bg-blue-50/60"
                        : "border-slate-200 bg-white hover:border-slate-300",
                      !canAttach && !selected ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                      checked={selected}
                      disabled={!canToggle}
                      onChange={event => {
                        if (event.target.checked && !canAttach) {
                          return;
                        }

                        setSelectedKnowledgeDocumentIds(previous =>
                          event.target.checked
                            ? [...new Set([...previous, document.id])]
                            : previous.filter(id => id !== document.id)
                        );
                      }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {document.originalName}
                        </p>
                        {!canAttach && !selected && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            Locked
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                          {document.status}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                          {document.classification}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                          {document.isIndexed ? "INDEXED" : "INDEXING"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                          {document.campaignCount} campaigns
                        </span>
                      </div>

                      {document.campaignNames && document.campaignNames.length > 0 && (
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          Used by campaigns:{" "}
                          {document.campaignNames.map(campaign => campaign.name).join(", ")}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Selected Knowledge</h3>
            <p className="mt-1 text-sm text-slate-500">
              The AI may only use the documents attached to this campaign.
            </p>

            <div className="mt-4 space-y-2">
              {selectedDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">No campaign knowledge selected yet.</p>
              ) : (
                selectedDocuments.map(document => (
                  <div key={document.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {document.originalName}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Rules</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>• Archived documents cannot be newly selected.</li>
              <li>• Cross-tenant documents are never shown.</li>
              <li>• Existing selections can remain attached.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export function getKnowledgeBackHref(
  campaignId:
    string
): string {
  return `/communication/campaigns/new/audience?campaign=${encodeURIComponent(campaignId)}`;
}

export function getKnowledgeContinueHref(
  campaignId:
    string
): string {
  return `/communication/campaigns/new/channels?campaign=${encodeURIComponent(campaignId)}`;
}
