import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { asyncHandler } from "@/lib/async-handler";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { requireRole } from "@/lib/auth";
import { resolveIVRBuilderContext } from "@/services/ivr/ivr-builder-catalog.service";

const ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

const BuilderContextRequestSchema = z.object({
  campaignId: z.string().trim().min(1).optional().nullable(),
  inboundProfileId: z.string().trim().min(1).optional().nullable(),
  returnTo: z.string().trim().optional().nullable(),
});

export const GET = asyncHandler(async (request: NextRequest) => {
  try {
    const currentUser = await requireRole(ROLES);
    const searchParams = request.nextUrl.searchParams;

    const body = BuilderContextRequestSchema.parse({
      campaignId: searchParams.get("campaignId") ?? searchParams.get("campaign"),
      inboundProfileId: searchParams.get("inboundProfileId") ?? searchParams.get("inboundProfile"),
      returnTo: searchParams.get("returnTo"),
    });

    const builderContext = await resolveIVRBuilderContext(currentUser, body);

    return NextResponse.json(
      {
        success: true,
        data: builderContext,
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
          message: "Invalid IVR builder context request",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "IVR builder context could not be loaded",
      },
      {
        status: 400,
      }
    );
  }
});
