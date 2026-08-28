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

      assertCommunicationCampaignAccess:
        vi.fn(),

      updateCommunicationCampaignSchedule:
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
    assertCommunicationCampaignAccess:
      mocks.assertCommunicationCampaignAccess,

    updateCommunicationCampaignSchedule:
      mocks.updateCommunicationCampaignSchedule,
  })
);

import {
  POST,
} from "@/app/api/communication/campaigns/[id]/schedule/route";

describe(
  "communication campaign schedule route",
  () => {
    it(
      "rejects unauthorized users",
      async () => {
        mocks.requireCampaignCapability.mockRejectedValue(
          new Error("forbidden")
        );

        mocks.createAuthErrorResponse.mockReturnValue(
          NextResponse.json(
            {
              success: false,
              message: "Forbidden",
            },
            {
              status: 403,
            }
          )
        );

        const request =
          new NextRequest(
            "https://example.com/api/communication/campaigns/campaign-1/schedule",
            {
              method: "POST",
              body: JSON.stringify({
                launchImmediately: false,
                scheduledAt:
                  "2026-08-29T10:00:00.000Z",
              }),
            }
          );

        const response =
          await POST(
            request,
            {
              params: Promise.resolve({
                id: "campaign-1",
              }),
            }
          );

        expect(
          response.status
        ).toBe(403);

        expect(
          mocks.updateCommunicationCampaignSchedule
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "updates the campaign schedule when authorized",
      async () => {
        mocks.requireCampaignCapability.mockResolvedValue(
          {
            id: "user-1",
          }
        );

        mocks.updateCommunicationCampaignSchedule.mockResolvedValue(
          {
            id: "campaign-1",
          }
        );

        const request =
          new NextRequest(
            "https://example.com/api/communication/campaigns/campaign-1/schedule",
            {
              method: "POST",
              body: JSON.stringify({
                launchImmediately: false,
                scheduledAt:
                  "2026-08-29T10:00:00.000Z",
              }),
            }
          );

        const response =
          await POST(
            request,
            {
              params: Promise.resolve({
                id: "campaign-1",
              }),
            }
          );

        expect(
          response.status
        ).toBe(200);

        expect(
          mocks.assertCommunicationCampaignAccess
        ).toHaveBeenCalledWith(
          "campaign-1",
          expect.any(Object)
        );

        expect(
          mocks.updateCommunicationCampaignSchedule
        ).toHaveBeenCalledWith(
          "campaign-1",
          expect.objectContaining({
            launchImmediately: false,
          }),
          expect.any(Object)
        );
      }
    );
  }
);
