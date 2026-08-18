import CommunicationCampaignDetailsScreen from "@/components/omnibank/communication-campaign-details-screen";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface PageProps {
  params:
    Promise<{
      id:
        string;
    }>;
}

//--------------------------------------------------
// Page
//--------------------------------------------------

export default async function CommunicationCampaignDetailsPage({
  params,
}: PageProps) {
  const {
    id,
  } =
    await params;

  return (
    <CommunicationCampaignDetailsScreen
      campaignId={
        id
      }
    />
  );
}