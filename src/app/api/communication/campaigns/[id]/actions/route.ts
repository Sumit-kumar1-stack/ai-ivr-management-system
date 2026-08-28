import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  z,
  ZodError,
} from "zod";

import {
  CallAuthenticationLevel,
} from "@prisma/client";

import {
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

import {
  createCommunicationCampaignAction,
  listCommunicationCampaignActions,
} from "@/services/communication/campaign-action-resolver.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

const createActionSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(
          2
        )
        .max(
          120
        ),

    actionCode:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          80
        ),

    type:
      z.enum([
        "MOCK",
        "WEBHOOK",
      ]),

    endpoint:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          2_000
        )
        .optional()
        .nullable(),

    integrationRef:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          200
        )
        .optional()
        .nullable(),

    requiredAuthLevel:
      z.enum([
        "AUTH_LEVEL_0",
        "AUTH_LEVEL_1",
        "AUTH_LEVEL_2",
        "AUTH_LEVEL_3",
      ]).default(
        "AUTH_LEVEL_0"
      ),

    requiresConfirmation:
      z.boolean().default(
        false
      ),

    timeoutMs:
      z
        .number()
        .int()
        .min(
          1_000
        )
        .max(
          120_000
        )
        .default(
          10_000
        ),

    enabled:
      z.boolean().default(
        true
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
// GET
//--------------------------------------------------

export async function GET(
  _request:
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

    const actions =
      await listCommunicationCampaignActions(
        id
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          actions,
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

    const message =
      error instanceof
        Error
        ? error.message
        : "Campaign actions could not be loaded";

    return NextResponse.json(
      {
        success:
          false,

        message,
      },
      {
        status:
          message.includes(
            "not found"
          )
            ? 404
            : 400,
      }
    );
  }
}

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
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
      createActionSchema.parse(
        await request.json()
      );

    const action =
      await createCommunicationCampaignAction({
          communicationCampaignId:
          id,

        name:
          body.name,

        actionCode:
          body.actionCode,

        type:
          body.type,

        endpoint:
          body.endpoint ?? null,

        integrationRef:
          body.integrationRef ?? null,

        requiredAuthLevel:
          body.requiredAuthLevel as CallAuthenticationLevel,

        requiresConfirmation:
          body.requiresConfirmation,

          timeoutMs:
            body.timeoutMs,

          enabled:
            body.enabled,
        },
        currentUser
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          action,
      },
      {
        status:
          201,

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
            "Invalid campaign action",

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
        : "Campaign action could not be created";

    return NextResponse.json(
      {
        success:
          false,

        message,
      },
      {
        status:
          message.includes(
            "not found"
          )
            ? 404
            : message.includes(
                "required"
              )
              ? 400
              : 409,
      }
    );
  }
}
