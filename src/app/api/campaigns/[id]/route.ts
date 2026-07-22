import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  asyncHandler,
} from "@/lib/async-handler";

import {
  requireRole,
} from "@/lib/auth";

import {
  CampaignNotFoundError,
} from "@/lib/app-error";


//--------------------------------------------------
// Context
//--------------------------------------------------

interface RouteContext {
  params:
    Promise<{
      id: string;
    }>;
}


//--------------------------------------------------
// Get Campaign
//--------------------------------------------------

export const GET =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,
      context:
        RouteContext
    ) => {

      await requireRole([
        "AGENT",
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          campaignId,
      } = await context.params;


      const campaign =
        await prisma.campaign.findUnique({
          where: {
            id:
              campaignId,
          },

          include: {
            contacts: {
              include: {
                contact:
                  true,
              },
            },

            runs: {
              orderBy: {
                createdAt:
                  "desc",
              },

              take:
                10,
            },

            calls: {
              orderBy: {
                createdAt:
                  "desc",
              },

              take:
                50,

              include: {
                contact: {
                  select: {
                    id:
                      true,

                    fullName:
                      true,

                    phone:
                      true,
                  },
                },
              },
            },
          },
        });


      if (
        !campaign
      ) {

        throw new CampaignNotFoundError(
          campaignId
        );

      }


      return NextResponse.json({
        success:
          true,

        message:
          "Campaign fetched successfully",

        data:
          campaign,
      });

    }
  );


//--------------------------------------------------
// Update Campaign
//--------------------------------------------------

export const PATCH =
  asyncHandler<RouteContext>(
    async (
      request:
        NextRequest,
      context:
        RouteContext
    ) => {

      await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          campaignId,
      } = await context.params;


      const existingCampaign =
        await prisma.campaign.findUnique({
          where: {
            id:
              campaignId,
          },

          select: {
            id:
              true,
          },
        });


      if (
        !existingCampaign
      ) {

        throw new CampaignNotFoundError(
          campaignId
        );

      }


      const body =
        await request.json();


      const campaign =
        await prisma.campaign.update({
          where: {
            id:
              campaignId,
          },

          data: {
            name:
              typeof body.name ===
              "string"
                ? body.name.trim()
                : undefined,

            description:
              typeof body.description ===
              "string"
                ? body.description.trim()
                : undefined,

            language:
              typeof body.language ===
              "string"
                ? body.language.trim()
                : undefined,
          },
        });


      return NextResponse.json({
        success:
          true,

        message:
          "Campaign updated successfully",

        data:
          campaign,
      });

    }
  );


//--------------------------------------------------
// Delete Campaign
//--------------------------------------------------

export const DELETE =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,
      context:
        RouteContext
    ) => {

      await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          campaignId,
      } = await context.params;


      const existingCampaign =
        await prisma.campaign.findUnique({
          where: {
            id:
              campaignId,
          },

          select: {
            id:
              true,
          },
        });


      if (
        !existingCampaign
      ) {

        throw new CampaignNotFoundError(
          campaignId
        );

      }


      await prisma.campaign.delete({
        where: {
          id:
            campaignId,
        },
      });


      return NextResponse.json({
        success:
          true,

        message:
          "Campaign deleted successfully",
      });

    }
  );