"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Layers3,
  RadioTower,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  CAMPAIGN_LIFECYCLE_TABS,
  getCampaignBoardActions,
  filterCampaignsByLifecycleTab,
  getCampaignLifecycleTab,
  type CampaignLifecycleTab,
} from "@/components/campaigns/campaign-lifecycle";
import type { CommunicationCampaignDTO } from "@/types/communication-campaign";
import { api } from "@/lib/axios";
import type { CampaignCapability } from "@/services/communication/campaign-capabilities";

interface AuthMeResponse {
  campaignCapabilities?: CampaignCapability[];
}

const dateFormatter =
  new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<CampaignLifecycleTab>(
      "ALL"
    );

  const {
    data: campaigns,
    isLoading,
    isError,
  } =
    useQuery({
      queryKey: [
        "communication-campaigns",
      ],

      queryFn: async () => {
        const {
          data,
        } =
          await api.get(
            "/communication/campaigns"
          );

        return data.data as
          CommunicationCampaignDTO[];
      },
    });

  const {
    data: currentUser,
  } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Authenticated user could not be loaded");
      }

      return await response.json() as AuthMeResponse;
    },
  });

  const canCreateCampaign = Boolean(
    currentUser?.campaignCapabilities?.includes("CAMPAIGN_CREATE")
  );

  const campaignList =
    useMemo(
      () =>
        campaigns ?? [],
      [campaigns]
    );

  const counts =
    useMemo(() => {
      const totals: Record<
        CampaignLifecycleTab,
        number
      > = {
        ALL: campaignList.length,
        DRAFT: 0,
        PENDING_APPROVAL: 0,
        APPROVED: 0,
        RUNNING: 0,
        COMPLETED: 0,
        REJECTED: 0,
        ARCHIVED: 0,
      };

      for (
        const campaign of campaignList
      ) {
        const tab =
          getCampaignLifecycleTab(
            campaign
          );

        totals[tab] += 1;
      }

      return totals;
    }, [campaignList]);

  const visibleCampaigns =
    useMemo(
      () =>
        filterCampaignsByLifecycleTab(
          campaignList,
          activeTab
        ),
      [
        campaignList,
        activeTab,
      ]
    );

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,78,134,0.95)_52%,rgba(37,99,235,0.88))] p-8 text-white md:grid-cols-[1.3fr_0.7fr] md:p-10">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Campaigns
            </p>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                Campaigns
              </h1>

              <p className="max-w-2xl text-sm leading-6 text-white/78 md:text-base">
                Manage your customer outreach campaigns.
              </p>
            </div>

            {canCreateCampaign && (
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/communication/campaigns/new/audience"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:translate-y-[-1px]"
                >
                  Create Campaign
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}

            <div className="grid gap-3 pt-2 text-sm text-white/78 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  <Compass size={14} />
                  Parent campaigns
                </div>
                <p className="mt-2 leading-6">
                  The list below shows business campaigns only.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  <RadioTower size={14} />
                  Internal test
                </div>
                <p className="mt-2 leading-6">
                  Quick Test Call stays separate for internal demos.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:self-end">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                <Layers3 size={14} />
                Lifecycle filters
              </div>
              <p className="mt-2 text-sm leading-6 text-white/85">
                Draft, Approved, Running, Completed, and Archived.
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                <CheckCircle2 size={14} />
                Parent records
              </div>
              <p className="mt-2 text-sm leading-6 text-white/85">
                Child runtime records stay in the backend and detail views.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Business campaigns
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Parent campaigns for customer outreach and launch operations.
            </p>
          </div>

          <p className="text-sm text-slate-500">
            Showing {visibleCampaigns.length} of {counts.ALL} campaign
            {counts.ALL === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_LIFECYCLE_TABS.map(tab => {
            const active = tab.value === activeTab;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() =>
                  setActiveTab(
                    tab.value
                  )
                }
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                ].join(" ")}
              >
                {tab.label}

                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {counts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">
            Loading campaigns...
          </p>
        ) : isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Failed to load campaigns.
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No campaigns found in this lifecycle state.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleCampaigns.map(campaign => (
              <BusinessCampaignCard
                key={campaign.id}
                campaign={campaign}
                onActionComplete={async () => {
                  await queryClient.invalidateQueries({
                    queryKey: ["communication-campaigns"],
                  });
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BusinessCampaignCard({
  campaign,
  onActionComplete,
}: {
  campaign: CommunicationCampaignDTO;
  onActionComplete: () => Promise<void>;
}) {
  const lifecycleTab =
    getCampaignLifecycleTab(
      campaign
    );

  const knowledgeCount =
    campaign.knowledgeDocumentIds
      .length;

  const actions =
    getCampaignBoardActions(
      campaign
    );

  async function runMutationAction(
    action:
      (typeof actions)[number]
  ): Promise<void> {
    if (
      !action.apiPath
    ) {
      return;
    }

    const response =
      await fetch(
        `/api${action.apiPath}`,
        {
          method:
            action.kind === "delete"
              ? "DELETE"
              : "POST",
        }
      );

    if (
      !response.ok
    ) {
      const payload =
        await response
          .json()
          .catch(() => ({}));

      throw new Error(
        payload.message ??
          "Campaign action failed"
      );
    }

    await onActionComplete();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">
            {campaign.name}
          </h3>

          <p className="text-sm text-slate-500">
            {campaign.audienceSourceName}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
            {lifecycleTab}
          </span>

          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {campaign.approvalStatus}
          </span>
        </div>
      </div>

      {campaign.channels.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {campaign.channels.map(channel => (
            <span
              key={channel}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {channel}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DetailStat
          label="Recipients"
          value={campaign.recipientCount.toLocaleString()}
        />

        <DetailStat
          label="Knowledge"
          value={knowledgeCount.toLocaleString()}
        />

        <DetailStat
          label="Launch"
          value={
            campaign.scheduledAt
              ? formatDate(
                  campaign.scheduledAt
                )
              : "On demand"
          }
        />
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-400">
          Updated {formatDate(campaign.updatedAt)}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {actions.map(action =>
            action.kind === "link" ? (
              <Link
                key={action.label}
                href={action.href ?? "#"}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  action.tone === "primary"
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : action.tone === "secondary"
                      ? "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      : "text-blue-600 hover:text-blue-800",
                ].join(" ")}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={() => void runMutationAction(action)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  action.tone === "primary"
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : action.tone === "secondary"
                      ? "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                ].join(" ")}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string): string {
  return dateFormatter.format(
    new Date(
      value
    )
  );
}
