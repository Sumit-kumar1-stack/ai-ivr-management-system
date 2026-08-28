import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      requireCampaignCapability:
        vi.fn(),

      createCommunicationCampaign:
        vi.fn(),

      createAuthErrorResponse:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/auth",
  () => ({
    requireCampaignCapability:
      mocks.requireCampaignCapability,
  })
);

vi.mock(
  "@/lib/auth-response",
  () => ({
    createAuthErrorResponse:
      mocks.createAuthErrorResponse,
  })
);

vi.mock(
  "@/services/communication/communication-campaign.service",
  () => ({
    createCommunicationCampaign:
      mocks.createCommunicationCampaign,
  })
);

import {
  POST,
} from "@/app/api/communication/campaigns/route";

describe("communication campaigns create route", () => {
  it("rejects unauthorized viewers from creating campaigns", async () => {
    mocks.requireCampaignCapability.mockRejectedValue(
      new Error("forbidden")
    );

    mocks.createAuthErrorResponse.mockReturnValue(
      NextResponse.json(
        {
          success: false,
          message: "Forbidden",
        },
        { status: 403 }
      )
    );

    const request =
      new NextRequest(
        "https://example.com/api/communication/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            name: "Campaign",
          }),
        }
      );

    const response =
      await POST(request);

    expect(response.status).toBe(403);
    expect(
      mocks.createCommunicationCampaign
    ).not.toHaveBeenCalled();
  });
});
