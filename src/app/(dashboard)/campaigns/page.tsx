"use client";

import Link from "next/link";

import CreateCampaignDialog from "@/components/campaigns/create-campaign-dialog";
import { useCampaigns } from "@/features/campaigns/use-campaigns";

export default function CampaignsPage() {
  const { data: campaigns, isLoading } =
    useCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Campaigns
        </h1>

        <CreateCampaignDialog />
      </div>

      {isLoading && (
        <p>Loading campaigns...</p>
      )}

      {!isLoading &&
        campaigns?.length === 0 && (
          <div className="rounded-lg border p-6 text-center text-gray-500">
            No campaigns found.
          </div>
        )}

      {campaigns?.map((campaign: any) => (
        <div
          key={campaign.id}
          className="rounded-lg border p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">
            {campaign.name}
          </h2>

          <p className="text-gray-500">
            {campaign.language} • {campaign.status}
          </p>

          {campaign.description && (
            <p className="mt-2 text-gray-600">
              {campaign.description}
            </p>
          )}

          <Link
            href={`/campaigns/${campaign.id}`}
            className="mt-4 inline-block text-blue-600"
          >
            Manage →
          </Link>
        </div>
      ))}
    </div>
  );
}