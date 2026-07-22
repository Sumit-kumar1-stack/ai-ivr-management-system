import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  CampaignContactService,
} from "@/features/campaigns/campaign-contact.service";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  success,
} from "@/lib/api-response";


interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}


const CAMPAIGN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Get Assigned Campaign Contacts
//--------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {

  try {

    await requireRole(
      CAMPAIGN_ROLES
    );


    const {
      id,
    } = await params;


    const campaignId =
      id.trim();


    if (
      !campaignId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Campaign ID is required",
        },
        {
          status:
            400,
        }
      );
    }


    const contacts =
      await CampaignContactService
        .getCampaignContacts(
          campaignId
        );


    return success(
      contacts,
      "Campaign contacts fetched successfully"
    );

  } catch (error) {

    return handleError(
      error,
      "Failed to fetch campaign contacts"
    );

  }

}


//--------------------------------------------------
// Assign Contacts To Campaign
//--------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {

  try {

    await requireRole(
      CAMPAIGN_ROLES
    );


    const {
      id,
    } = await params;


    const campaignId =
      id.trim();


    if (
      !campaignId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Campaign ID is required",
        },
        {
          status:
            400,
        }
      );
    }


    const body =
      await request.json();


    const result =
      await CampaignContactService
        .assignContacts(
          campaignId,
          body
        );


    return success(
      result,
      "Contacts assigned successfully"
    );

  } catch (error) {

    return handleError(
      error,
      "Failed to assign campaign contacts"
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