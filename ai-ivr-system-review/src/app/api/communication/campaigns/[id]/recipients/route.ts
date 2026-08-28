import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZodError,
} from "zod";

import {
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  ingestCommunicationRecipients,
  listCommunicationRecipients,
  replaceCommunicationRecipients,
} from "@/services/communication/communication-recipient.service";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

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

    const result =
      await listCommunicationRecipients(
        id
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          result,
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
    return handleError(
      error,
      "Recipient list failed"
    );
  }
}

//--------------------------------------------------
// POST - Append Batch
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
      await request.json();

    const result =
      await ingestCommunicationRecipients(
        id,
        body
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          result,
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
    return handleError(
      error,
      "Recipient import failed"
    );
  }
}

//--------------------------------------------------
// PUT - Replace Snapshot
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
      await request.json();

    const result =
      await replaceCommunicationRecipients(
        id,
        body
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          result,
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
    return handleError(
      error,
      "Recipient replacement failed"
    );
  }
}

//--------------------------------------------------
// Error Handler
//--------------------------------------------------

function handleError(
  error:
    unknown,

  fallbackMessage:
    string
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

  if (
    error instanceof
    ZodError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Invalid communication recipient batch",

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
      : fallbackMessage;

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
                "cannot be changed"
              )
            ? 409
            : 400,
    }
  );
}
