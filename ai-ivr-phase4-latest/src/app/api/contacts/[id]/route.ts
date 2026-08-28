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
  NotFoundError,
  ValidationError,
} from "@/lib/app-error";

import {
  assertContactOwnership,
} from "@/services/security/tenant-access.service";


//--------------------------------------------------
// Route Context
//--------------------------------------------------

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}


//--------------------------------------------------
// Get Contact
//--------------------------------------------------

export const GET =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,

      context:
        RouteContext
    ) => {

      const currentUser = await requireRole([
        "AGENT",
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          contactId,
      } = await context.params;

      await assertContactOwnership(
        contactId,
        currentUser
      );


      const contact =
        await prisma.contact.findUnique({
          where: {
            id:
              contactId,
          },

          include: {
            campaigns: {
              include: {
                campaign: {
                  select: {
                    id:
                      true,

                    name:
                      true,

                    status:
                      true,

                    createdAt:
                      true,
                  },
                },
              },

              orderBy: {
                createdAt:
                  "desc",
              },
            },

            calls: {
              orderBy: {
                createdAt:
                  "desc",
              },

              take:
                50,

              select: {
                id:
                  true,

                campaignId:
                  true,

                campaignRunId:
                  true,

                providerCallId:
                  true,

                contactPhoneSnapshot:
                  true,

                providerDestination:
                  true,

                usedDevelopmentOverride:
                  true,

                status:
                  true,

                duration:
                  true,

                requestedAt:
                  true,

                queuedAt:
                  true,

                ringingAt:
                  true,

                answeredAt:
                  true,

                completedAt:
                  true,

                failedAt:
                  true,

                createdAt:
                  true,
              },
            },
          },
        });


      if (
        !contact
      ) {

        throw new NotFoundError(
          "Contact",
          contactId
        );

      }


      return NextResponse.json({
        success:
          true,

        message:
          "Contact fetched successfully",

        data:
          contact,
      });

    }
  );


//--------------------------------------------------
// Update Contact
//--------------------------------------------------

export const PATCH =
  asyncHandler<RouteContext>(
    async (
      request:
        NextRequest,

      context:
        RouteContext
    ) => {

      const currentUser = await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          contactId,
      } = await context.params;

      await assertContactOwnership(
        contactId,
        currentUser
      );


      const existingContact =
        await prisma.contact.findUnique({
          where: {
            id:
              contactId,
          },

          select: {
            id:
              true,
          },
        });


      if (
        !existingContact
      ) {

        throw new NotFoundError(
          "Contact",
          contactId
        );

      }


      const body =
        await request.json();


      const fullName =
        typeof body.fullName ===
        "string"
          ? body.fullName.trim()
          : undefined;


      const phone =
        typeof body.phone ===
        "string"
          ? body.phone.trim()
          : undefined;


      const email =
        typeof body.email ===
        "string"
          ? body.email.trim() ||
            null
          : undefined;


      const company =
        typeof body.company ===
        "string"
          ? body.company.trim() ||
            null
          : undefined;


      const language =
        typeof body.language ===
        "string"
          ? body.language.trim()
          : undefined;


      const notes =
        typeof body.notes ===
        "string"
          ? body.notes.trim() ||
            null
          : undefined;


      if (
        fullName !==
          undefined &&
        !fullName
      ) {

        throw new ValidationError(
          "Full name cannot be empty"
        );

      }


      if (
        phone !==
          undefined &&
        !phone
      ) {

        throw new ValidationError(
          "Phone number cannot be empty"
        );

      }


      const contact =
        await prisma.contact.update({
          where: {
            id:
              contactId,
          },

          data: {
            fullName,
            phone,
            email,
            company,
            language,
            notes,

            status:
              body.status,
          },
        });


      return NextResponse.json({
        success:
          true,

        message:
          "Contact updated successfully",

        data:
          contact,
      });

    }
  );


//--------------------------------------------------
// Delete Contact
//--------------------------------------------------

export const DELETE =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,

      context:
        RouteContext
    ) => {

      const currentUser = await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id:
          contactId,
      } = await context.params;

      await assertContactOwnership(
        contactId,
        currentUser
      );


      const existingContact =
        await prisma.contact.findUnique({
          where: {
            id:
              contactId,
          },

          select: {
            id:
              true,
          },
        });


      if (
        !existingContact
      ) {

        throw new NotFoundError(
          "Contact",
          contactId
        );

      }


      await prisma.contact.delete({
        where: {
          id:
            contactId,
        },
      });


      return NextResponse.json({
        success:
          true,

        message:
          "Contact deleted successfully",
      });

    }
  );
