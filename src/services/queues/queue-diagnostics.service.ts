import {
  CALL_RETRY_QUEUE_NAME,
  CallRetryQueueService,
} from "@/services/calls/call-retry-queue.service";
import {
  CAMPAIGN_QUEUE_NAME,
  CampaignQueueService,
} from "@/services/campaigns/campaign-queue.service";
import {
  COMMUNICATION_QUEUE_NAME,
  CommunicationCampaignQueueService,
} from "@/services/communication/communication-campaign-queue.service";

export async function getQueueDiagnostics() {
  const [campaign, communication, callRetry] = await Promise.all([
    CampaignQueueService.getReadOnlyCounts(),
    CommunicationCampaignQueueService.getReadOnlyCounts(),
    CallRetryQueueService.getReadOnlyCounts(),
  ]);

  return [
    {
      name: CAMPAIGN_QUEUE_NAME,
      counts: campaign,
    },
    {
      name: COMMUNICATION_QUEUE_NAME,
      counts: communication,
    },
    {
      name: CALL_RETRY_QUEUE_NAME,
      counts: callRetry,
    },
  ];
}
