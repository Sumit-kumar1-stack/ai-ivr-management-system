import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  z,
  ZodError,
} from "zod";

import {
  requireAnyCampaignCapabilities,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  approveCommunicationCampaign,
  rejectCommunicationCampaign,
  requestChangesCommunicationCampaign,
} from "@/services/communication/communication-campaign.service";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const ReviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireAnyCampaignCapabilities(
        [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ] as const
      );

    const { id } = await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const body = ReviewSchema.parse(
      await request.json()
    );

    if (
      (body.decision === "REJECT" ||
        body.decision === "REQUEST_CHANGES") &&
      !body.reason?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Rejection reason is required",
        },
        {
          status: 400,
        }
      );
    }

    const campaign =
      body.decision === "APPROVE"
        ? await approveCommunicationCampaign(
            id,
            currentUser
          )
        : body.decision === "REQUEST_CHANGES"
          ? await requestChangesCommunicationCampaign(
              id,
              currentUser,
              {
                reason: body.reason ?? null,
              }
            )
        : await rejectCommunicationCampaign(
            id,
            currentUser,
            {
              reason: body.reason ?? null,
            }
          );

    return NextResponse.json(
      {
        success: true,
        data: campaign,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid campaign approval request",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Campaign approval request failed";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : message.includes("cannot approve") ||
                message.includes("their own communication campaign") ||
                message.includes("already approved")
              ? 409
              : 400,
      }
    );
  }
}
