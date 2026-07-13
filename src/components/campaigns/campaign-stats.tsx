"use client";

import { useCampaignStats } from "@/features/campaigns/use-campaign-stats";

interface Props {
  campaignId: string;
}

export default function CampaignStats({
  campaignId,
}: Props) {
  const { data } = useCampaignStats(campaignId);

  return (
    <div className="grid grid-cols-4 gap-5">
      <div className="rounded-lg border p-5">
        <h3 className="text-gray-500">
          Assigned
        </h3>

        <p className="text-3xl font-bold">
          {data?.assigned ?? 0}
        </p>
      </div>

      <div className="rounded-lg border p-5">
        <h3 className="text-gray-500">
          Pending
        </h3>

        <p className="text-3xl font-bold">
          {data?.pending ?? 0}
        </p>
      </div>

      <div className="rounded-lg border p-5">
        <h3 className="text-gray-500">
          Answered
        </h3>

        <p className="text-3xl font-bold">
          {data?.answered ?? 0}
        </p>
      </div>

      <div className="rounded-lg border p-5">
        <h3 className="text-gray-500">
          Failed
        </h3>

        <p className="text-3xl font-bold">
          {data?.failed ?? 0}
        </p>
      </div>
    </div>
  );
}