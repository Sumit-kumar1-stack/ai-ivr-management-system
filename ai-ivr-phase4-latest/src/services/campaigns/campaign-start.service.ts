import {
  CampaignRunStatus,
  CampaignStatus,
  ContactStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

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

import {
  transitionCampaignInTransaction,
} from "@/services/campaigns/campaign-transition.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface StartCampaignExecutionResult {
  campaignId:
    string;

  campaignRunId:
    string;

  campaignStatus:
    CampaignStatus;

  runStatus:
    CampaignRunStatus;

  scheduled:
    boolean;

  scheduledAt:
    string | null;

  delayMs:
    number;

  total:
    number;

  excluded:
    number;
}

//--------------------------------------------------
// Start Existing Voice Campaign
//--------------------------------------------------

export async function startCampaignExecution(
  campaignId:
    string
): Promise<StartCampaignExecutionResult> {
  const normalizedCampaignId =
    campaignId.trim();

  if (
    !normalizedCampaignId
  ) {
    throw new CampaignNotFoundError(
      campaignId
    );
  }

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

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

  if (
    !campaign
  ) {
    throw new CampaignNotFoundError(
      normalizedCampaignId
    );
  }

  //------------------------------------------------
  // State Guards
  //------------------------------------------------

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

  if (
    campaign.status ===
    CampaignStatus.CANCELLED
  ) {
    throw new CampaignConflictError(
      "Cancelled campaigns cannot be started",
      campaign.status
    );
  }

  //------------------------------------------------
  // Callable Contacts
  //------------------------------------------------

  const callableContacts =
    campaign.contacts.filter(
      ({
        contact,
      }) => {
        if (
          contact.status ===
          ContactStatus.BLOCKED
        ) {
          return false;
        }

        return isCallablePhoneNumber(
          contact.phone
        );
      }
    );

  if (
    callableContacts.length ===
    0
  ) {
    throw new NoCallableContactsError(
      campaign.id
    );
  }

  //------------------------------------------------
  // Provider
  //------------------------------------------------

  validateProviderConfiguration();

  //------------------------------------------------
  // Schedule
  //------------------------------------------------

  const schedule =
    resolveOutboundSchedule(
      campaign.scheduledAt
    );

  const targetCampaignStatus =
    schedule.scheduled
      ? CampaignStatus.SCHEDULED
      : CampaignStatus.QUEUED;

  //------------------------------------------------
  // Atomic Claim + Run
  //------------------------------------------------

  const result =
    await prisma.$transaction(
      async transaction => {
        try {
          await transitionCampaignInTransaction(
            transaction,
            {
              campaignId:
                campaign.id,

              actor:
                null,

              requestedTransition:
                "LAUNCH",

              targetStatus:
                targetCampaignStatus,
            }
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "";

          if (
            !message.includes(
              "Campaign"
            )
          ) {
            throw error;
          }

          const current =
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
            !current
          ) {
            throw new CampaignNotFoundError(
              campaign.id
            );
          }

          throw new CampaignConflictError(
            getCampaignConflictMessage(
              current.status
            ),
            current.status
          );
        }

        const campaignRun =
          await transaction
            .campaignRun
            .create({
              data: {
                campaignId:
                  campaign.id,

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

  //------------------------------------------------
  // Queue
  //------------------------------------------------

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
    const failedAt =
      new Date();

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

  return {
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
  };
}

//--------------------------------------------------
// Conflict
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
// Phone
//--------------------------------------------------

function isCallablePhoneNumber(
  phone:
    string |
    null |
    undefined
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

  return /^\+?[1-9]\d{9,14}$/.test(
    normalized
  );
}

//--------------------------------------------------
// Provider
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

  throw new ProviderUnavailableError(
    `Telephony provider "${provider}" is not configured for campaign dispatch`,
    {
      provider,
    }
  );
}

//--------------------------------------------------
// Error
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
    const withCode =
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
        withCode.code,
    };
  }

  return {
    message:
      String(
        error
      ),
  };
}
