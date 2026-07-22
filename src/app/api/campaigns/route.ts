import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  CampaignService,
} from "@/features/campaigns/campaign.service";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  success,
} from "@/lib/api-response";


const CAMPAIGN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Get Campaigns
//--------------------------------------------------

export async function GET() {

  try {

    await requireRole(
      CAMPAIGN_ROLES
    );


    const campaigns =
      await CampaignService.getCampaigns();


    return success(
      campaigns,
      "Campaigns fetched successfully"
    );

  } catch (error) {

    return handleError(
      error,
      "Failed to fetch campaigns"
    );

  }

}


//--------------------------------------------------
// Create Campaign
//--------------------------------------------------

export async function POST(
  request: NextRequest
) {

  try {

    await requireRole(
      CAMPAIGN_ROLES
    );


    const body =
      await request.json();


    const campaign =
      await CampaignService.createCampaign(
        body
      );


    return success(
      campaign,
      "Campaign created successfully"
    );

  } catch (error) {

    return handleError(
      error,
      "Failed to create campaign"
    );

  }

}


//--------------------------------------------------
// Error Handler
//--------------------------------------------------

function handleError(
  error: unknown,
  fallbackMessage: string
): NextResponse {

  const authResponse =
    createAuthErrorResponse(
      error
    );


  if (
    authResponse
  ) {
    return authResponse;
  }


  console.error(
    fallbackMessage,
    error
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        fallbackMessage,
    },
    {
      status:
        500,
    }
  );

}