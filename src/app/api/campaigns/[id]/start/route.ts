import {
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

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
  CampaignConflictError,
  CampaignNotFoundError,
  NoCallableContactsError,
  ProviderUnavailableError,
} from "@/lib/app-error";

import {
  CampaignQueueService,
} from "@/services/campaigns/campaign-queue.service";


//--------------------------------------------------
// Context Type
//--------------------------------------------------

interface RouteContext {
  params:
    Promise<{
      id: string;
    }>;
}


//--------------------------------------------------
// Start Campaign
//--------------------------------------------------

export const POST =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,
      context:
        RouteContext
    ) => {

      //----------------------------------------
      // Authorization
      //----------------------------------------

      await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      //----------------------------------------
      // Read Campaign ID
      //----------------------------------------

      const {
        id:
          campaignId,
      } = await context.params;


      //----------------------------------------
      // Load Campaign
      //----------------------------------------

      const campaign =
        await prisma.campaign.findUnique({
          where: {
            id:
              campaignId,
          },

          select: {
            id:
              true,

            status:
              true,

            contacts: {
              select: {
                contactId:
                  true,

                contact: {
                  select: {
                    id:
                      true,

                    phone:
                      true,

                    status:
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


      //----------------------------------------
      // Validate Current Status
      //----------------------------------------

      if (
        campaign.status ===
          CampaignStatus.QUEUED ||
        campaign.status ===
          CampaignStatus.RUNNING
      ) {

        throw new CampaignConflictError(
          "Campaign is already queued or running",
          campaign.status
        );

      }


      //----------------------------------------
      // Resolve Callable Contacts
      //----------------------------------------

      const callableContacts =
        campaign.contacts.filter(
          item =>
            Boolean(
              item.contact.phone
                ?.trim()
            )
        );


      if (
        callableContacts.length ===
        0
      ) {

        throw new NoCallableContactsError(
          campaignId
        );

      }


      //----------------------------------------
      // Validate Provider Configuration
      //----------------------------------------

      validateProviderConfiguration();


      //----------------------------------------
      // Atomically Claim Campaign
      //----------------------------------------

      const result =
        await prisma.$transaction(
          async transaction => {

            const claimed =
              await transaction
                .campaign
                .updateMany({
                  where: {
                    id:
                      campaignId,

                    status: {
                      in: [
                        CampaignStatus.DRAFT,
                        CampaignStatus.SCHEDULED,
                        CampaignStatus.PAUSED,
                        CampaignStatus.COMPLETED,
                        CampaignStatus.FAILED,
                      ],
                    },
                  },

                  data: {
                    status:
                      CampaignStatus.QUEUED,

                    completedAt:
                      null,
                  },
                });


            if (
              claimed.count ===
              0
            ) {

              const currentCampaign =
                await transaction
                  .campaign
                  .findUnique({
                    where: {
                      id:
                        campaignId,
                    },

                    select: {
                      status:
                        true,
                    },
                  });


              if (
                !currentCampaign
              ) {

                throw new CampaignNotFoundError(
                  campaignId
                );

              }


              throw new CampaignConflictError(
                "Campaign could not be started in its current state",
                currentCampaign.status
              );

            }


            const campaignRun =
              await transaction
                .campaignRun
                .create({
                  data: {
                    campaignId,

                    status:
                      CampaignRunStatus.QUEUED,

                    total:
                      callableContacts.length,

                    processed:
                      0,

                    successful:
                      0,

                    failed:
                      0,
                  },
                });


            return {
              campaignRun,
            };

          }
        );


      //----------------------------------------
      // Enqueue Background Job
      //----------------------------------------

      try {

        await CampaignQueueService.enqueue({
          campaignId,

          campaignRunId:
            result.campaignRun.id,
        });

      } catch (error) {

        /*
         * Compensate for queue failure so the
         * campaign does not remain permanently queued.
         */
        await prisma.$transaction([
          prisma.campaignRun.update({
            where: {
              id:
                result.campaignRun.id,
            },

            data: {
              status:
                CampaignRunStatus.FAILED,

              completedAt:
                new Date(),
            },
          }),

          prisma.campaign.update({
            where: {
              id:
                campaignId,
            },

            data: {
              status:
                CampaignStatus.FAILED,

              completedAt:
                new Date(),
            },
          }),
        ]);


        throw new ProviderUnavailableError(
          "Campaign queue is currently unavailable",
          normalizeError(
            error
          )
        );

      }


      //----------------------------------------
      // Return Accepted Response
      //----------------------------------------

      return NextResponse.json(
        {
          success:
            true,

          message:
            "Campaign queued successfully",

          data: {
            campaignId,

            campaignRunId:
              result.campaignRun.id,

            status:
              CampaignRunStatus.QUEUED,

            total:
              callableContacts.length,
          },
        },
        {
          status:
            202,
        }
      );

    }
  );


//--------------------------------------------------
// Validate Provider Configuration
//--------------------------------------------------

function validateProviderConfiguration():
  void {

  const provider =
    process.env
      .TELEPHONY_PROVIDER
      ?.trim()
      .toLowerCase() ??
    "twilio";


  if (
    provider ===
    "twilio"
  ) {

    const missingVariables =
      [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "TWILIO_PUBLIC_BASE_URL",
      ].filter(
        name =>
          !process.env[name]
            ?.trim()
      );


    if (
      missingVariables.length >
      0
    ) {

      throw new ProviderUnavailableError(
        "Twilio provider is not configured",
        {
          missingVariables,
        }
      );

    }

  }

}


//--------------------------------------------------
// Normalize Unknown Error
//--------------------------------------------------

function normalizeError(
  error: unknown
) {

  if (
    error instanceof
    Error
  ) {

    return {
      name:
        error.name,

      message:
        error.message,
    };

  }


  return {
    message:
      String(
        error
      ),
  };

}