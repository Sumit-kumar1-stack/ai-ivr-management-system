import { describe, expect, it, vi } from "vitest";

import {
  deleteCampaignFromUi,
  RUNNING_CAMPAIGN_DELETE_MESSAGE,
} from "@/app/(dashboard)/campaigns/campaign-delete-action";

const campaign = {
  id: "campaign/1",
  name: "Summer Campaign",
  status: "DRAFT" as const,
};

describe("campaign delete UI action", () => {
  it("confirms with the campaign name, deletes through the existing endpoint, and refreshes", async () => {
    const confirmAction = vi.fn(() => true);
    const request = vi.fn(async () => new Response(null, { status: 200 }));
    const refresh = vi.fn(async () => undefined);

    const result = await deleteCampaignFromUi({
      campaign,
      confirmAction,
      request: request as unknown as typeof fetch,
      refresh,
    });

    expect(confirmAction).toHaveBeenCalledWith(
      "Delete Summer Campaign? This action cannot be undone."
    );
    expect(request).toHaveBeenCalledWith(
      "/api/communication/campaigns/campaign%2F1",
      { method: "DELETE" }
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toEqual({
      outcome: "deleted",
      message: "Summer Campaign deleted.",
    });
  });

  it("does nothing when confirmation is cancelled", async () => {
    const request = vi.fn();
    const refresh = vi.fn();

    await expect(
      deleteCampaignFromUi({
        campaign,
        confirmAction: () => false,
        request: request as unknown as typeof fetch,
        refresh,
      })
    ).resolves.toEqual({ outcome: "cancelled" });

    expect(request).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("blocks a running campaign before confirmation or any request", async () => {
    const confirmAction = vi.fn(() => true);
    const request = vi.fn();

    await expect(
      deleteCampaignFromUi({
        campaign: { ...campaign, status: "RUNNING" },
        confirmAction,
        request: request as unknown as typeof fetch,
        refresh: vi.fn(),
      })
    ).resolves.toEqual({
      outcome: "blocked",
      message: RUNNING_CAMPAIGN_DELETE_MESSAGE,
    });

    expect(confirmAction).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [401, {}, "Your session has expired. Sign in and try again."],
    [403, {}, "You are not authorized to delete this campaign."],
    [409, {}, "Campaign cannot be deleted in its current state."],
    [409, { message: "Campaign cannot be deleted while status is RUNNING" }, RUNNING_CAMPAIGN_DELETE_MESSAGE],
  ])("handles HTTP %s without refreshing", async (status, body, message) => {
    const refresh = vi.fn();
    const request = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      deleteCampaignFromUi({
        campaign,
        confirmAction: () => true,
        request: request as unknown as typeof fetch,
        refresh,
      })
    ).resolves.toEqual({ outcome: "error", message });

    expect(refresh).not.toHaveBeenCalled();
  });
});
