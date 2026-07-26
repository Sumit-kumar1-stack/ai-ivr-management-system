import {
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCampaignLogger,
  getDurationMs,
  maskPhoneNumber,
  normalizeError,
} from "@/lib/logger";

import {
  startCall,
} from "@/services/telephony/telephony.service";

//--------------------------------------------------
// Campaign Contact Result Types
//--------------------------------------------------

interface CampaignContactSuccessResult {
  contactId: string;

  contactPhone: string;

  providerDestination: string;

  success: true;

  callId: string;

  providerCallId?: string;

  duplicate: boolean;
}

interface CampaignContactFailureResult {
  contactId: string;

  contactPhone: string;

  providerDestination?: string;

  success: false;

  error: {
    name: string;

    message: string;

    code?:
      | string
      | number;
  };
}

export type CampaignContactResult =
  | CampaignContactSuccessResult
  | CampaignContactFailureResult;

export interface RunCampaignResult {
  campaignId: string;

  campaignRunId: string;

  total: number;

  processed: number;

  successful: number;

  failed: number;

  status: CampaignRunStatus;

  results:
    CampaignContactResult[];
}

//--------------------------------------------------
// Run Campaign
//--------------------------------------------------

export async function runCampaign(
  campaignId: string,
  campaignRunId: string
): Promise<RunCampaignResult> {
  const startedAt =
    process.hrtime.bigint();

  const log =
    createCampaignLogger(
      campaignId,
      campaignRunId
    );

  log.info(
    {
      event:
        "campaign.dispatch.execution.started",
    },
    "Campaign execution started"
  );

  try {
    //------------------------------------------------
    // Load Campaign And Contacts
    //------------------------------------------------

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
        },
      });

    if (
      !campaign
    ) {
      throw new Error(
        `Campaign not found: ${campaignId}`
      );
    }

    //------------------------------------------------
    // Load Campaign Run
    //------------------------------------------------

    const campaignRun =
      await prisma.campaignRun.findUnique({
        where: {
          id:
            campaignRunId,
        },
      });

    if (
      !campaignRun
    ) {
      throw new Error(
        `Campaign run not found: ${campaignRunId}`
      );
    }

    if (
      campaignRun.campaignId !==
      campaign.id
    ) {
      throw new Error(
        "Campaign run does not belong to the supplied campaign"
      );
    }

    //------------------------------------------------
    // Return Existing Final Run
    //------------------------------------------------

    if (
      campaignRun.status ===
        CampaignRunStatus.COMPLETED ||
      campaignRun.status ===
        CampaignRunStatus.FAILED ||
      campaignRun.status ===
        CampaignRunStatus.CANCELLED
    ) {
      log.warn(
        {
          event:
            "campaign.dispatch.execution.skipped",

          reason:
            "run_already_terminal",

          status:
            campaignRun.status,

          total:
            campaignRun.total,

          processed:
            campaignRun.processed,

          successful:
            campaignRun.successful,

          failed:
            campaignRun.failed,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign run is already finished"
      );

      return {
        campaignId,

        campaignRunId,

        total:
          campaignRun.total,

        processed:
          campaignRun.processed,

        successful:
          campaignRun.successful,

        failed:
          campaignRun.failed,

        status:
          campaignRun.status,

        results:
          [],
      };
    }

    //------------------------------------------------
    // Atomically Claim Campaign Run
    //------------------------------------------------

    const campaignStartedAt =
      new Date();

    const claimedRun =
      await prisma.campaignRun.updateMany({
        where: {
          id:
            campaignRunId,

          campaignId,

          status:
            CampaignRunStatus.QUEUED,
        },

        data: {
          status:
            CampaignRunStatus.RUNNING,

          startedAt:
            campaignStartedAt,

          total:
            campaign.contacts.length,
        },
      });

    if (
      claimedRun.count ===
      0
    ) {
      const currentRun =
        await prisma.campaignRun.findUnique({
          where: {
            id:
              campaignRunId,
          },
        });

      if (
        !currentRun
      ) {
        throw new Error(
          `Campaign run disappeared: ${campaignRunId}`
        );
      }

      log.warn(
        {
          event:
            "campaign.dispatch.claim.skipped",

          reason:
            "run_not_queued",

          currentStatus:
            currentRun.status,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign run could not be claimed"
      );

      return {
        campaignId,

        campaignRunId,

        total:
          currentRun.total,

        processed:
          currentRun.processed,

        successful:
          currentRun.successful,

        failed:
          currentRun.failed,

        status:
          currentRun.status,

        results:
          [],
      };
    }

    log.info(
      {
        event:
          "campaign.dispatch.claim.completed",

        totalContacts:
          campaign.contacts.length,

        startedAt:
          campaignStartedAt.toISOString(),
      },
      "Campaign run claimed"
    );

    //------------------------------------------------
    // Mark Campaign Running
    //------------------------------------------------

    await prisma.campaign.update({
      where: {
        id:
          campaign.id,
      },

      data: {
        status:
          CampaignStatus.RUNNING,

        startedAt:
          campaign.startedAt ??
          campaignStartedAt,

        completedAt:
          null,
      },
    });

    //------------------------------------------------
    // Validate Campaign-Level Configuration
    //------------------------------------------------

    const providerPhoneNumber =
      getRequiredEnvironmentVariable(
        "TWILIO_PHONE_NUMBER"
      );

    const testDestination =
      process.env
        .TEST_DESTINATION_NUMBER
        ?.trim();

    const developmentOverrideEnabled =
      process.env.NODE_ENV ===
        "development" &&
      Boolean(
        testDestination
      );

    //------------------------------------------------
    // Prepare Campaign Counters
    //------------------------------------------------

    const total =
      campaign.contacts.length;

    const results:
      CampaignContactResult[] =
      [];

    let processed =
      0;

    let successful =
      0;

    let failed =
      0;

    log.info(
      {
        event:
          "campaign.dispatch.started",

        totalContacts:
          total,

        developmentOverrideEnabled,
      },
      "Campaign contact dispatch started"
    );

    //------------------------------------------------
    // Handle Empty Campaign
    //------------------------------------------------

    if (
      total ===
      0
    ) {
      const completedAt =
        new Date();

      await prisma.$transaction([
        prisma.campaignRun.update({
          where: {
            id:
              campaignRunId,
          },

          data: {
            status:
              CampaignRunStatus.COMPLETED,

            total:
              0,

            processed:
              0,

            successful:
              0,

            failed:
              0,

            completedAt,
          },
        }),

        prisma.campaign.update({
          where: {
            id:
              campaign.id,
          },

          data: {
            status:
              CampaignStatus.COMPLETED,

            completedAt,
          },
        }),
      ]);

      log.info(
        {
          event:
            "campaign.dispatch.empty.completed",

          completedAt:
            completedAt.toISOString(),

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Empty campaign completed"
      );

      return {
        campaignId,

        campaignRunId,

        total:
          0,

        processed:
          0,

        successful:
          0,

        failed:
          0,

        status:
          CampaignRunStatus.COMPLETED,

        results:
          [],
      };
    }

    //------------------------------------------------
    // Process Contacts Independently
    //------------------------------------------------

    for (
      const item of
      campaign.contacts
    ) {
      const contact =
        item.contact;

      const contactStartedAt =
        process.hrtime.bigint();

      const contactPhone =
        contact.phone
          ?.trim() ??
        "";

      let providerDestination:
        string |
        undefined;

      try {
        //--------------------------------------------
        // Validate Contact
        //--------------------------------------------

        if (
          !contactPhone
        ) {
          throw new Error(
            "Contact phone number is missing"
          );
        }

        //--------------------------------------------
        // Resolve Actual Provider Destination
        //--------------------------------------------

        providerDestination =
          developmentOverrideEnabled
            ? testDestination!
            : contactPhone;

        if (
          !providerDestination
        ) {
          throw new Error(
            "Provider destination is missing"
          );
        }

        log.debug(
          {
            event:
              "campaign.contact.dispatch.started",

            contactId:
              contact.id,

            contactPhone:
              maskPhoneNumber(
                contactPhone
              ),

            providerDestination:
              maskPhoneNumber(
                providerDestination
              ),

            developmentOverrideEnabled,
          },
          "Campaign contact dispatch started"
        );

        //--------------------------------------------
        // Start Call
        //--------------------------------------------

        const result =
          await startCall({
            campaignId:
              campaign.id,

            campaignRunId,

            contactId:
              contact.id,

            contactPhone,

            to:
              providerDestination,

            from:
              providerPhoneNumber,

            language:
              contact.language ??
              campaign.language ??
              "English",

            script:
              campaign.description?.trim() ||
              "Hello from the AI IVR management system.",

            usedDevelopmentOverride:
              developmentOverrideEnabled,

            destinationOverrideSource:
              developmentOverrideEnabled
                ? "TEST_DESTINATION_NUMBER"
                : undefined,
          });

        successful +=
          1;

        results.push({
          contactId:
            contact.id,

          contactPhone,

          providerDestination,

          success:
            true,

          callId:
            result.callId,

          providerCallId:
            result.providerCallId,

          duplicate:
            result.duplicate ??
            false,
        });

        log.info(
          {
            event:
              "campaign.contact.dispatch.completed",

            contactId:
              contact.id,

            callId:
              result.callId,

            providerCallId:
              result.providerCallId,

            duplicate:
              result.duplicate ??
              false,

            usedDevelopmentOverride:
              developmentOverrideEnabled,

            durationMs:
              getDurationMs(
                contactStartedAt
              ),
          },
          "Campaign contact dispatched successfully"
        );
      } catch (
        error
      ) {
        failed +=
          1;

        const normalizedError =
          normalizeCampaignError(
            error
          );

        results.push({
          contactId:
            contact.id,

          contactPhone,

          providerDestination,

          success:
            false,

          error:
            normalizedError,
        });

        log.error(
          {
            event:
              "campaign.contact.dispatch.failed",

            contactId:
              contact.id,

            contactPhone:
              maskPhoneNumber(
                contactPhone
              ),

            providerDestination:
              providerDestination
                ? maskPhoneNumber(
                    providerDestination
                  )
                : undefined,

            durationMs:
              getDurationMs(
                contactStartedAt
              ),

            error:
              normalizedError,
          },
          "Campaign contact processing failed"
        );
      } finally {
        processed +=
          1;

        await updateCampaignRunProgressSafely({
          campaignId,

          campaignRunId,

          total,

          processed,

          successful,

          failed,
        });
      }
    }

    //------------------------------------------------
    // Initial Dispatch Finished
    //------------------------------------------------

    await prisma.$transaction([
      prisma.campaignRun.update({
        where: {
          id:
            campaignRunId,
        },

        data: {
          status:
            CampaignRunStatus.RUNNING,

          total,

          processed,

          successful,

          failed,

          completedAt:
            null,
        },
      }),

      prisma.campaign.update({
        where: {
          id:
            campaign.id,
        },

        data: {
          status:
            CampaignStatus.RUNNING,

          completedAt:
            null,
        },
      }),
    ]);

    log.info(
      {
        event:
          "campaign.dispatch.completed",

        totalContacts:
          total,

        processedContacts:
          processed,

        dispatchedContacts:
          successful,

        dispatchFailedContacts:
          failed,

        runStatus:
          CampaignRunStatus.RUNNING,

        campaignStatus:
          CampaignStatus.RUNNING,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Campaign initial dispatch completed"
    );

    //------------------------------------------------
    // Re-Evaluate Finalization
    //------------------------------------------------

    const {
      finalizeCampaignRunIfReady,
    } = await import(
      "@/services/campaigns/campaign-finalizer.service"
    );

    const finalizationStartedAt =
      process.hrtime.bigint();

    const finalization =
      await finalizeCampaignRunIfReady(
        campaignRunId
      );

    log.info(
      {
        event:
          "campaign.finalization.checked_after_dispatch",

        finalized:
          finalization.finalized,

        skipped:
          finalization.skipped,

        reason:
          finalization.reason,

        runStatus:
          finalization.runStatus,

        settledContacts:
          finalization.settledContacts,

        unresolvedContacts:
          finalization.unresolvedContacts,

        durationMs:
          getDurationMs(
            finalizationStartedAt
          ),
      },
      "Campaign finalization checked after initial dispatch"
    );

    return {
      campaignId,

      campaignRunId,

      total,

      processed,

      successful,

      failed,

      status:
        finalization.runStatus,

      results,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "campaign.dispatch.execution.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Campaign execution failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Safely Persist Campaign Progress
//--------------------------------------------------

async function updateCampaignRunProgressSafely(
  input: {
    campaignId: string;

    campaignRunId: string;

    total: number;

    processed: number;

    successful: number;

    failed: number;
  }
): Promise<void> {
  const log =
    createCampaignLogger(
      input.campaignId,
      input.campaignRunId
    );

  try {
    await prisma.campaignRun.update({
      where: {
        id:
          input.campaignRunId,
      },

      data: {
        total:
          input.total,

        processed:
          input.processed,

        successful:
          input.successful,

        failed:
          input.failed,
      },
    });

    log.debug(
      {
        event:
          "campaign.progress.persisted",

        total:
          input.total,

        processed:
          input.processed,

        successful:
          input.successful,

        failed:
          input.failed,
      },
      "Campaign progress persisted"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "campaign.progress.persistence_failed",

        total:
          input.total,

        processed:
          input.processed,

        successful:
          input.successful,

        failed:
          input.failed,

        error:
          normalizeError(
            error
          ),
      },
      "Failed to persist campaign progress"
    );
  }
}

//--------------------------------------------------
// Read Required Environment Variable
//--------------------------------------------------

function getRequiredEnvironmentVariable(
  name: string
): string {
  const value =
    process.env[
      name
    ]
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      `${name} is not configured`
    );
  }

  return value;
}

//--------------------------------------------------
// Campaign Result Error
//--------------------------------------------------

function normalizeCampaignError(
  error: unknown
): {
  name: string;

  message: string;

  code?:
    | string
    | number;
} {
  const normalized =
    normalizeError(
      error
    );

  return {
    name:
      normalized.name ??
      "Error",

    message:
      normalized.message,

    code:
      normalized.code,
  };
}