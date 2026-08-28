import CampaignHeader from "@/components/campaigns/campaign-header";
import CampaignStats from "@/components/campaigns/campaign-stats";
import CampaignContactsCard from "@/components/campaigns/campaign-contacts-card";

export default async function CampaignDetailsPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">

      <CampaignHeader
        campaignId={id}
      />

      <CampaignStats
        campaignId={id}
      />

      <CampaignContactsCard
        campaignId={id}
      />

    </div>
  );
}