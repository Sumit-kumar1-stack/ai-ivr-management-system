import {
  CampaignRunStatus,
  CampaignStatus,
  ContactStatus,
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

import {
  resolveOutboundSchedule,
} from "@/services/campaigns/outbound-schedule.service";

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
      } =
        await context.params;

      //----------------------------------------
      // Normalize Campaign ID
      //----------------------------------------

      const normalizedCampaignId =
        campaignId.trim();

      if (
        !normalizedCampaignId
      ) {
        throw new CampaignNotFoundError(
          campaignId
        );
      }

      //----------------------------------------
      // Load Campaign
      //----------------------------------------

      const campaign =
        await prisma
          .campaign
          .findUnique({
            where: {
              id:
                normalizedCampaignId,
            },

            select: {
              id:
                true,

              status:
                true,

              scheduledAt:
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

      //----------------------------------------
      // Campaign Must Exist
      //----------------------------------------

      if (
        !campaign
      ) {
        throw new CampaignNotFoundError(
          normalizedCampaignId
        );
      }

      //----------------------------------------
      // Reject Active / Scheduled Campaign
      //----------------------------------------

      /*
       * SCHEDULED is treated as an active campaign
       * state here.
       *
       * Allowing another POST /start while already
       * SCHEDULED could create a second CampaignRun
       * and a second BullMQ delayed job.
       */
      if (
        campaign.status ===
          CampaignStatus.SCHEDULED ||
        campaign.status ===
          CampaignStatus.QUEUED ||
        campaign.status ===
          CampaignStatus.RUNNING
      ) {
        throw new CampaignConflictError(
          campaign.status ===
            CampaignStatus.SCHEDULED
            ? "Campaign is already scheduled"
            : "Campaign is already queued or running",
          campaign.status
        );
      }

      //----------------------------------------
      // Cancelled Campaign Guard
      //----------------------------------------

      if (
        campaign.status ===
        CampaignStatus.CANCELLED
      ) {
        throw new CampaignConflictError(
          "Cancelled campaigns cannot be started",
          campaign.status
        );
      }

      //----------------------------------------
      // Resolve Callable Contacts
      //----------------------------------------

      const callableContacts =
        campaign.contacts.filter(
          ({
            contact,
          }) => {
            //----------------------------------
            // Blocked Contacts
            //----------------------------------

            if (
              contact.status ===
              ContactStatus.BLOCKED
            ) {
              return false;
            }

            //----------------------------------
            // Invalid / Missing Phone
            //----------------------------------

            return isCallablePhoneNumber(
              contact.phone
            );
          }
        );

      //----------------------------------------
      // Require At Least One Callable Contact
      //----------------------------------------

      if (
        callableContacts.length ===
        0
      ) {
        throw new NoCallableContactsError(
          campaign.id
        );
      }

      //----------------------------------------
      // Validate Provider Configuration
      //----------------------------------------

      validateProviderConfiguration();

      //----------------------------------------
      // Resolve Outbound Schedule
      //----------------------------------------

      const schedule =
        resolveOutboundSchedule(
          campaign.scheduledAt
        );

      //----------------------------------------
      // Resolve Target Campaign Status
      //----------------------------------------

      const targetCampaignStatus =
        schedule.scheduled
          ? CampaignStatus.SCHEDULED
          : CampaignStatus.QUEUED;

      //----------------------------------------
      // Atomically Claim Campaign
      //----------------------------------------

      const result =
        await prisma.$transaction(
          async transaction => {
            /*
             * This compare-and-set prevents two
             * concurrent /start requests from both
             * creating campaign runs.
             *
             * SCHEDULED is intentionally NOT included.
             */
            const claimed =
              await transaction
                .campaign
                .updateMany({
                  where: {
                    id:
                      campaign.id,

                    status: {
                      in: [
                        CampaignStatus.DRAFT,
                        CampaignStatus.PAUSED,
                        CampaignStatus.COMPLETED,
                        CampaignStatus.FAILED,
                      ],
                    },
                  },

                  data: {
                    status:
                      targetCampaignStatus,

                    /*
                     * The worker owns the real
                     * SCHEDULED/QUEUED -> RUNNING
                     * transition.
                     */
                    startedAt:
                      null,

                    completedAt:
                      null,
                  },
                });

            //----------------------------------
            // Campaign Claim Failed
            //----------------------------------

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
                        campaign.id,
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
                  campaign.id
                );
              }

              throw new CampaignConflictError(
                getCampaignConflictMessage(
                  currentCampaign.status
                ),
                currentCampaign.status
              );
            }

            //----------------------------------
            // Create Campaign Run
            //----------------------------------

            const campaignRun =
              await transaction
                .campaignRun
                .create({
                  data: {
                    campaignId:
                      campaign.id,

                    /*
                     * Even scheduled campaigns keep
                     * their run QUEUED.
                     *
                     * BullMQ's delay represents the
                     * scheduled waiting state.
                     */
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

                    startedAt:
                      null,

                    completedAt:
                      null,
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
        await CampaignQueueService.enqueue(
          {
            campaignId:
              campaign.id,

            campaignRunId:
              result
                .campaignRun
                .id,
          },
          {
            delayMs:
              schedule.delayMs,
          }
        );
      } catch (
        error
      ) {
        //--------------------------------------
        // Queue Failure Compensation
        //--------------------------------------

        const failedAt =
          new Date();

        /*
         * If BullMQ cannot accept the job,
         * compensate the database transaction so
         * nothing remains permanently QUEUED or
         * SCHEDULED without an actual job.
         */
        await prisma.$transaction([
          prisma
            .campaignRun
            .updateMany({
              where: {
                id:
                  result
                    .campaignRun
                    .id,

                campaignId:
                  campaign.id,

                status:
                  CampaignRunStatus.QUEUED,
              },

              data: {
                status:
                  CampaignRunStatus.FAILED,

                failed:
                  callableContacts.length,

                completedAt:
                  failedAt,
              },
            }),

          prisma
            .campaign
            .updateMany({
              where: {
                id:
                  campaign.id,

                status: {
                  in: [
                    CampaignStatus.SCHEDULED,
                    CampaignStatus.QUEUED,
                  ],
                },
              },

              data: {
                status:
                  CampaignStatus.FAILED,

                completedAt:
                  failedAt,
              },
            }),
        ]);

        throw new ProviderUnavailableError(
          "Campaign queue is currently unavailable",
          normalizeUnknownError(
            error
          )
        );
      }

      //----------------------------------------
      // Response Message
      //----------------------------------------

      const message =
        schedule.scheduled
          ? "Campaign scheduled successfully"
          : "Campaign queued successfully";

      //----------------------------------------
      // Return Accepted Response
      //----------------------------------------

      return NextResponse.json(
        {
          success:
            true,

          message,

          data: {
            campaignId:
              campaign.id,

            campaignRunId:
              result
                .campaignRun
                .id,

            campaignStatus:
              targetCampaignStatus,

            runStatus:
              CampaignRunStatus.QUEUED,

            scheduled:
              schedule.scheduled,

            scheduledAt:
              schedule
                .scheduledAt
                ?.toISOString() ??
              null,

            delayMs:
              schedule.delayMs,

            total:
              callableContacts.length,

            excluded:
              campaign
                .contacts
                .length -
              callableContacts
                .length,
          },
        },
        {
          status:
            202,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }
  );

//--------------------------------------------------
// Campaign Conflict Message
//--------------------------------------------------

function getCampaignConflictMessage(
  status:
    CampaignStatus
): string {
  switch (
    status
  ) {
    case CampaignStatus.SCHEDULED:
      return "Campaign is already scheduled";

    case CampaignStatus.QUEUED:
      return "Campaign is already queued";

    case CampaignStatus.RUNNING:
      return "Campaign is already running";

    case CampaignStatus.CANCELLED:
      return "Cancelled campaigns cannot be started";

    default:
      return "Campaign could not be started in its current state";
  }
}

//--------------------------------------------------
// Validate Callable Phone Number
//--------------------------------------------------

function isCallablePhoneNumber(
  phone:
    | string
    | null
    | undefined
): boolean {
  if (
    !phone
  ) {
    return false;
  }

  const normalized =
    phone
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  /*
   * Basic E.164-compatible validation.
   *
   * Examples:
   *
   * +919876543210
   * 919876543210
   * 9876543210
   *
   * Optional leading + followed by
   * 10 to 15 digits.
   */
  return /^\+?[1-9]\d{9,14}$/.test(
    normalized
  );
}

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

  //----------------------------------------
  // Twilio
  //----------------------------------------

  if (
    provider ===
    "twilio"
  ) {
    const requiredVariables =
      [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "TWILIO_PUBLIC_BASE_URL",
        "TWILIO_MEDIA_PUBLIC_URL",
      ] as const;

    const missingVariables =
      requiredVariables.filter(
        name =>
          !process
            .env[name]
            ?.trim()
      );

    if (
      missingVariables.length >
      0
    ) {
      throw new ProviderUnavailableError(
        "Twilio provider is not configured",
        {
          missingVariables:
            [
              ...missingVariables,
            ],
        }
      );
    }

    return;
  }

  //----------------------------------------
  // Unsupported Provider Guard
  //----------------------------------------

  /*
   * Do not silently continue when a provider
   * is selected but its production adapter has
   * not yet been enabled.
   */
  throw new ProviderUnavailableError(
    `Telephony provider "${provider}" is not configured for campaign dispatch`,
    {
      provider,
    }
  );
}

//--------------------------------------------------
// Normalize Unknown Error
//--------------------------------------------------

function normalizeUnknownError(
  error:
    unknown
): {
  name?:
    string;

  message:
    string;

  code?:
    string |
    number;
} {
  if (
    error instanceof
    Error
  ) {
    const errorWithCode =
      error as
        Error & {
          code?:
            string |
            number;
        };

    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,
    };
  }

  return {
    message:
      String(
        error
      ),
  };
}