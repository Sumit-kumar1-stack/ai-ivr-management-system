import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  z,
  ZodError,
} from "zod";

import {
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  bindCommunicationIvrFlow,
} from "@/services/communication/communication-ivr-binding.service";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

const inputSchema =
  z.object({
    ivrFlowId:
      z
        .string()
        .trim()
        .min(
          1
        ),
  });

//--------------------------------------------------
// Context
//--------------------------------------------------

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

//--------------------------------------------------
// PUT
//--------------------------------------------------

export async function PUT(
  request:
    NextRequest,

  context:
    RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireCampaignCapability(
        "CAMPAIGN_EDIT"
      );

    const {
      id,
    } =
      await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const body =
      inputSchema.parse(
        await request.json()
      );

    const flow =
      await bindCommunicationIvrFlow(
        id,
        body.ivrFlowId,
        currentUser
      );

    return NextResponse.json(
      {
        success:
          true,

        data: {
          ivrFlowId:
            flow.id,

          flow,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (
    error
  ) {
    const authResponse =
      createAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    if (
      error instanceof
      ZodError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid IVR flow selection",

          issues:
            error.issues,
        },
        {
          status:
            400,
        }
      );
    }

    const message =
      error instanceof
        Error
        ? error.message
        : "IVR flow could not be bound";

    const status =
      message.includes(
        "not found"
      )
        ? 404
        : message.includes(
              "cannot be changed"
            )
          ? 409
          : 400;

    return NextResponse.json(
      {
        success:
          false,

        message,
      },
      {
        status,
      }
    );
  }
}
