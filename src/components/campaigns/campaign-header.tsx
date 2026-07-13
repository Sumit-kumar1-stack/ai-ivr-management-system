"use client";

import { Button } from "@/components/ui/button";
import ManageContactsDialog from "./manage-contacts-dialog";
import { useCampaign } from "@/features/campaigns/use-campaigns";
import CampaignSkeleton from "./campaign-skeleton";
import { useStartCampaign } from "@/features/campaigns/use-start-campaign";


interface CampaignHeaderProps {
  campaignId: string;
}

export default function CampaignHeader({
  campaignId,
}: CampaignHeaderProps) {
  const { data, isLoading } = useCampaign(campaignId);

  const startCampaign = useStartCampaign();

  if (isLoading) {
    return <CampaignSkeleton />;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-3xl font-bold">
          {data?.name}
        </h1>

        <p className="mt-1 text-gray-500">
          Language: {data?.language}
        </p>

        <p className="text-gray-500">
          Voice: {data?.voice}
        </p>

        <p className="text-gray-500">
          Status: {data?.status}
        </p>

        <p className="text-gray-500">
          {data?.contacts?.length ?? 0} Contacts
        </p>
      </div>

      <div className="flex gap-3">
        <ManageContactsDialog campaignId={campaignId} />

        <Button
          onClick={() => startCampaign.mutate(campaignId)}
          disabled={startCampaign.isPending}
        >
          {startCampaign.isPending
            ? "Starting..."
            : "Start Campaign"}
        </Button>
      </div>
    </div>
  );
}