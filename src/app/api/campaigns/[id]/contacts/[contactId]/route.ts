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
    contactId: string;
  }>;
}


const CAMPAIGN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Remove Contact From Campaign
//--------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {

  try {

    await requireRole(
      CAMPAIGN_ROLES
    );


    const {
      id,
      contactId,
    } = await params;


    const campaignId =
      id.trim();


    const normalizedContactId =
      contactId.trim();


    if (
      !campaignId ||
      !normalizedContactId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Campaign ID and contact ID are required",
        },
        {
          status:
            400,
        }
      );
    }


    const result =
      await CampaignContactService
        .removeContact(
          campaignId,
          normalizedContactId
        );


    return success(
      result,
      "Contact removed successfully"
    );

  } catch (error) {

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
      "Failed to remove campaign contact",
      error
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to remove campaign contact",
      },
      {
        status:
          500,
      }
    );

  }

}