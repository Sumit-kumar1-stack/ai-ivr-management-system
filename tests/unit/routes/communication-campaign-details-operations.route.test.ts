import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilities: vi.fn(),
  assertAccess: vi.fn(),
  details: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAnyCampaignCapabilities: mocks.requireCapabilities }));
vi.mock("@/lib/auth-response", () => ({ createAuthErrorResponse: () => null }));
vi.mock("@/services/communication/communication-campaign.service", () => ({ assertCommunicationCampaignAccess: mocks.assertAccess }));
vi.mock("@/services/communication/communication-campaign-details.service", () => ({ getCommunicationCampaignDetails: mocks.details }));

import { GET } from "@/app/api/communication/campaigns/[id]/details/route";

describe("communication campaign operational details route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapabilities.mockResolvedValue({ id: "user-1", tenantId: "tenant-a" });
    mocks.assertAccess.mockResolvedValue(undefined);
    mocks.details.mockResolvedValue({ progress: { totalRecipients: 1 }, attempts: [] });
  });

  it("enforces canonical ownership before returning progress and attempts", async () => {
    const response = await GET(
      new NextRequest("https://app.example.test/api/communication/campaigns/campaign-1/details?page=2&pageSize=10"),
      { params: Promise.resolve({ id: "campaign-1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.assertAccess).toHaveBeenCalledWith("campaign-1", expect.objectContaining({ tenantId: "tenant-a" }));
    expect(mocks.details).toHaveBeenCalledWith("campaign-1", { page: 2, pageSize: 10 });
  });

  it("does not load cross-tenant operational data when access is denied", async () => {
    mocks.assertAccess.mockRejectedValue(new Error("Communication campaign not found"));
    const response = await GET(
      new NextRequest("https://app.example.test/api/communication/campaigns/campaign-b/details"),
      { params: Promise.resolve({ id: "campaign-b" }) }
    );
    expect(response.status).toBe(404);
    expect(mocks.details).not.toHaveBeenCalled();
  });
});
