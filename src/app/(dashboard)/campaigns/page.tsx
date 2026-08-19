"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import CreateCampaignDialog from "@/components/campaigns/create-campaign-dialog";
import { useCampaigns } from "@/features/campaigns/use-campaigns";
import type { CampaignDTO } from "@/features/campaigns/campaign.types";
import type { CommunicationCampaignDTO } from "@/types/communication-campaign";
import { api } from "@/lib/axios";

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState<"voice" | "omnichannel">("voice");

  // Fetch Voice Campaigns
  const { data: voiceCampaigns, isLoading: isVoiceLoading } = useCampaigns();

  // Fetch Omnichannel Campaigns
  const { data: communicationCampaigns, isLoading: isCommLoading } = useQuery({
    queryKey: ["communication-campaigns"],
    queryFn: async () => {
      const { data } = await api.get("/communication/campaigns");
      return data.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Campaigns
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your customer outreach and voice automation campaigns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/communication/campaigns/new/audience"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow transition-colors hover:bg-blue-700"
          >
            New Omnichannel Campaign
          </Link>
          <CreateCampaignDialog />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("voice")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
            activeTab === "voice"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          Voice Campaigns
        </button>
        <button
          onClick={() => setActiveTab("omnichannel")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
            activeTab === "omnichannel"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          Omnichannel Campaigns
        </button>
      </div>

      {/* Voice Campaigns List */}
      {activeTab === "voice" && (
        <div className="space-y-4">
          {isVoiceLoading && (
            <p className="text-sm text-slate-500">Loading campaigns...</p>
          )}

          {!isVoiceLoading && voiceCampaigns?.length === 0 && (
            <div className="rounded-lg border p-6 text-center text-slate-500 bg-white">
              No voice campaigns found.
            </div>
          )}

          {voiceCampaigns?.map((campaign: CampaignDTO) => (
            <div
              key={campaign.id}
              className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-100/50 transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {campaign.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Language: {campaign.language} • Voice: {campaign.voice}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  campaign.status === "COMPLETED" ? "bg-green-50 text-green-700 border-green-200" :
                  campaign.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  "bg-slate-50 text-slate-700 border-slate-200"
                }`}>
                  {campaign.status}
                </span>
              </div>

              {campaign.description && (
                <p className="mt-2 text-slate-600 text-sm">
                  {campaign.description}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Voice Campaign
                </span>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
                >
                  Manage →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Omnichannel Campaigns List */}
      {activeTab === "omnichannel" && (
        <div className="space-y-4">
          {isCommLoading && (
            <p className="text-sm text-slate-500">Loading campaigns...</p>
          )}

          {!isCommLoading && communicationCampaigns?.length === 0 && (
            <div className="rounded-lg border p-6 text-center text-slate-500 bg-white">
              No omnichannel campaigns found. Start by creating a new one above.
            </div>
          )}

          {communicationCampaigns?.map((campaign: CommunicationCampaignDTO) => (
            <div
              key={campaign.id}
              className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-100/50 transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {campaign.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Audience: {campaign.audienceSourceName} • {campaign.recipientCount} recipients
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  campaign.status === "COMPLETED" ? "bg-green-50 text-green-700 border-green-200" :
                  campaign.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse" :
                  campaign.status === "DRAFT" ? "bg-slate-50 text-slate-700 border-slate-200" :
                  "bg-yellow-50 text-yellow-700 border-yellow-200"
                }`}>
                  {campaign.status}
                </span>
              </div>

              {campaign.channels && campaign.channels.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {campaign.channels.map((chan: string) => (
                    <span key={chan} className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                      {chan}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Created on {new Date(campaign.createdAt).toLocaleDateString()}
                </span>
                <Link
                  href={`/communication/campaigns/${campaign.id}`}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
                >
                  View Details & Insights →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}