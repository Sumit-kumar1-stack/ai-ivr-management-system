import type { CommunicationCampaignDTO } from "@/types/communication-campaign";

export function getPendingCampaignApprovals(
  campaigns: readonly CommunicationCampaignDTO[]
): CommunicationCampaignDTO[] {
  return campaigns.filter(
    campaign =>
      campaign.approvalStatus === "SUBMITTED" &&
      campaign.permissions?.canReview === true
  );
}
