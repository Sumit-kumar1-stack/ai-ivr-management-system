import type { CommunicationCampaignDTO } from "@/types/communication-campaign";

export const RUNNING_CAMPAIGN_DELETE_MESSAGE =
  "Cancel the running campaign before deleting it.";

type DeleteResult =
  | { outcome: "cancelled" }
  | { outcome: "deleted"; message: string }
  | { outcome: "blocked" | "error"; message: string };

interface DeleteCampaignInput {
  campaign: Pick<CommunicationCampaignDTO, "id" | "name" | "status">;
  confirmAction: (message: string) => boolean;
  request: typeof fetch;
  refresh: () => Promise<void>;
}

export async function deleteCampaignFromUi({
  campaign,
  confirmAction,
  request,
  refresh,
}: DeleteCampaignInput): Promise<DeleteResult> {
  if (campaign.status === "RUNNING") {
    return {
      outcome: "blocked",
      message: RUNNING_CAMPAIGN_DELETE_MESSAGE,
    };
  }

  const confirmed = confirmAction(
    `Delete ${campaign.name}? This action cannot be undone.`
  );

  if (!confirmed) {
    return { outcome: "cancelled" };
  }

  const response = await request(
    `/api/communication/campaigns/${encodeURIComponent(campaign.id)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (response.status === 401) {
      return {
        outcome: "error",
        message: "Your session has expired. Sign in and try again.",
      };
    }

    if (response.status === 403) {
      return {
        outcome: "error",
        message:
          payload.message ??
          "You are not authorized to delete this campaign.",
      };
    }

    if (response.status === 409) {
      return {
        outcome: "error",
        message:
          payload.message?.includes("RUNNING") === true
            ? RUNNING_CAMPAIGN_DELETE_MESSAGE
            : payload.message ??
              "Campaign cannot be deleted in its current state.",
      };
    }

    return {
      outcome: "error",
      message: payload.message ?? "Campaign could not be deleted.",
    };
  }

  await refresh();

  return {
    outcome: "deleted",
    message: `${campaign.name} deleted.`,
  };
}
