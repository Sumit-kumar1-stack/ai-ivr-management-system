import {
  CampaignRunStatus,
  CampaignStatus,
  ContactStatus,
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

import {
  resolveOutboundWorkflow,
} from "@/services/campaigns/outbound-workflow.service";

//--------------------------------------------------
// Campaign Contact Result Types
//--------------------------------------------------

interface CampaignContactSuccessResult {
  contactId:
    string;

  contactPhone:
    string;

  providerDestination:
    string;

  success:
    true;

  callId:
    string;

  providerCallId?:
    string;

  duplicate:
    boolean;
}

interface CampaignContactFailureResult {
  contactId:
    string;

  contactPhone:
    string;

  providerDestination?:
    string;

  success:
    false;

  error: {
    name:
      string;

    message:
      string;

    code?:
      | string
      | number;
  };
}

export type CampaignContactResult =
  | CampaignContactSuccessResult
  | CampaignContactFailureResult;

export interface RunCampaignResult {
  campaignId:
    string;

  campaignRunId:
    string;

  total:
    number;

  processed:
    number;

  successful:
    number;

  failed:
    number;

  status:
    CampaignRunStatus;

  results:
    CampaignContactResult[];
}

//--------------------------------------------------
// Run Campaign
//--------------------------------------------------

export async function runCampaign(
  campaignId:
    string,

  campaignRunId:
    string
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
      await prisma.campaign
        .findUnique({
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
      await prisma.campaignRun
        .findUnique({
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
    // Resolve Callable Campaign Contacts
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

    const excludedContactCount =
      campaign.contacts.length -
      callableContacts.length;

    log.info(
      {
        event:
          "campaign.contacts.callable_resolved",

        assignedContacts:
          campaign.contacts.length,

        callableContacts:
          callableContacts.length,

        excludedContacts:
          excludedContactCount,
      },
      "Campaign callable contacts resolved"
    );

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
    // Handle No Callable Contacts
    //------------------------------------------------

    if (
      callableContacts.length ===
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
            "campaign.dispatch.no_callable_contacts.completed",

          assignedContacts:
            campaign.contacts.length,

          excludedContacts:
            excludedContactCount,

          completedAt:
            completedAt.toISOString(),

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign completed because no callable contacts remained"
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
    // Atomically Claim Campaign Run
    //------------------------------------------------

    const campaignStartedAt =
      new Date();

    const claimedRun =
      await prisma.campaignRun
        .updateMany({
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
              callableContacts.length,
          },
        });

    //------------------------------------------------
    // Run Claim Failed
    //------------------------------------------------

    if (
      claimedRun.count ===
      0
    ) {
      const currentRun =
        await prisma.campaignRun
          .findUnique({
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
          callableContacts.length,

        assignedContacts:
          campaign.contacts.length,

        excludedContacts:
          excludedContactCount,

        startedAt:
          campaignStartedAt.toISOString(),
      },
      "Campaign run claimed"
    );

    //------------------------------------------------
    // Atomically Mark Campaign Running
    //------------------------------------------------

    const claimedCampaign =
      await prisma.campaign
        .updateMany({
          where: {
            id:
              campaign.id,

            status: {
              in: [
                CampaignStatus.QUEUED,
                CampaignStatus.SCHEDULED,
              ],
            },
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
    // Campaign Changed Before Worker Started
    //------------------------------------------------

    if (
      claimedCampaign.count ===
      0
    ) {
      const [
        currentCampaign,
        currentRun,
      ] =
        await Promise.all([
          prisma.campaign.findUnique({
            where: {
              id:
                campaign.id,
            },

            select: {
              status:
                true,
            },
          }),

          prisma.campaignRun.findUnique({
            where: {
              id:
                campaignRunId,
            },
          }),
        ]);

      //------------------------------------------------
      // Mirror Cancellation Onto Run
      //------------------------------------------------

      if (
        currentCampaign?.status ===
        CampaignStatus.CANCELLED
      ) {
        await prisma.campaignRun
          .updateMany({
            where: {
              id:
                campaignRunId,

              campaignId,

              status:
                CampaignRunStatus.RUNNING,
            },

            data: {
              status:
                CampaignRunStatus.CANCELLED,

              completedAt:
                new Date(),
            },
          });
      }

      //------------------------------------------------
      // Reload Run
      //------------------------------------------------

      const refreshedRun =
        await prisma.campaignRun
          .findUnique({
            where: {
              id:
                campaignRunId,
            },
          });

      if (
        !refreshedRun
      ) {
        throw new Error(
          `Campaign run disappeared: ${campaignRunId}`
        );
      }

      log.warn(
        {
          event:
            "campaign.dispatch.campaign_claim_skipped",

          campaignStatus:
            currentCampaign?.status,

          previousRunStatus:
            currentRun?.status,

          runStatus:
            refreshedRun.status,

          reason:
            "campaign_state_changed_before_dispatch",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign dispatch stopped because campaign state changed"
      );

      return {
        campaignId,

        campaignRunId,

        total:
          refreshedRun.total,

        processed:
          refreshedRun.processed,

        successful:
          refreshedRun.successful,

        failed:
          refreshedRun.failed,

        status:
          refreshedRun.status,

        results:
          [],
      };
    }

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
      callableContacts.length;

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

        assignedContacts:
          campaign.contacts.length,

        excludedContacts:
          excludedContactCount,

        developmentOverrideEnabled,
      },
      "Campaign contact dispatch started"
    );

    //------------------------------------------------
    // Process Contacts Independently
    //------------------------------------------------

    for (
      const item of
      callableContacts
    ) {
      //------------------------------------------------
      // Recheck Execution Ownership
      //------------------------------------------------

      const executionState =
        await readCampaignExecutionState(
          campaignId,
          campaignRunId
        );

      if (
        executionState.runStatus !==
          CampaignRunStatus.RUNNING ||
        executionState.campaignStatus !==
          CampaignStatus.RUNNING
      ) {
        log.warn(
          {
            event:
              "campaign.dispatch.stopped",

            reason:
              "campaign_or_run_no_longer_running",

            campaignStatus:
              executionState.campaignStatus,

            runStatus:
              executionState.runStatus,

            processed,

            successful,

            failed,
          },
          "Campaign dispatch stopped because execution ownership was lost"
        );

        break;
      }

      //------------------------------------------------
      // Contact
      //------------------------------------------------

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
        // Resolve Outbound Workflow
        //--------------------------------------------

        const workflow =
          resolveOutboundWorkflow({
            purpose:
              campaign.purpose,

            campaignName:
              campaign.name,

            description:
              campaign.description,

            prompt:
              campaign.prompt,

            contactName:
              contact.fullName,
          });

        //--------------------------------------------
        // Final Ownership Check Before Provider Call
        //--------------------------------------------

        const beforeCallState =
          await readCampaignExecutionState(
            campaignId,
            campaignRunId
          );

        if (
          beforeCallState.runStatus !==
            CampaignRunStatus.RUNNING ||
          beforeCallState.campaignStatus !==
            CampaignStatus.RUNNING
        ) {
          log.warn(
            {
              event:
                "campaign.contact.dispatch.skipped",

              reason:
                "execution_ownership_lost_before_provider_call",

              contactId:
                contact.id,

              campaignStatus:
                beforeCallState.campaignStatus,

              runStatus:
                beforeCallState.runStatus,
            },
            "Campaign contact was not dispatched because campaign stopped"
          );

          break;
        }

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
              workflow.openingMessage,

            workflowPurpose:
              workflow.purpose,

            workflowInstruction:
              workflow.systemInstruction,

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

            workflowPurpose:
              workflow.purpose,

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
        /*
         * Only increment progress for a contact that
         * actually entered the processing try/catch.
         *
         * The ownership break above occurs before this
         * try block, so cancelled contacts are not
         * falsely counted as processed.
         */

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

    /*
     * IMPORTANT:
     *
     * Never blindly write RUNNING here.
     *
     * A cancellation/failure may have happened while
     * dispatch was in progress.
     */

    const finalProgressWrite =
      await prisma.campaignRun
        .updateMany({
          where: {
            id:
              campaignRunId,

            campaignId,

            status:
              CampaignRunStatus.RUNNING,
          },

          data: {
            total,

            processed,

            successful,

            failed,
          },
        });

    //------------------------------------------------
    // Run Became Terminal During Dispatch
    //------------------------------------------------

    if (
      finalProgressWrite.count ===
      0
    ) {
      const currentRun =
        await prisma.campaignRun
          .findUnique({
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
            "campaign.dispatch.final_progress_skipped",

          reason:
            "run_no_longer_running",

          runStatus:
            currentRun.status,

          processed,

          successful,

          failed,
        },
        "Final campaign progress write skipped because run became terminal"
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

        results,
      };
    }

    //------------------------------------------------
    // Campaign Must Still Be Running
    //------------------------------------------------

    const executionStateAfterDispatch =
      await readCampaignExecutionState(
        campaignId,
        campaignRunId
      );

    if (
      executionStateAfterDispatch.runStatus !==
        CampaignRunStatus.RUNNING ||
      executionStateAfterDispatch.campaignStatus !==
        CampaignStatus.RUNNING
    ) {
      const currentRun =
        await prisma.campaignRun
          .findUnique({
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
            "campaign.dispatch.finalization_skipped",

          reason:
            "execution_no_longer_running",

          campaignStatus:
            executionStateAfterDispatch
              .campaignStatus,

          runStatus:
            executionStateAfterDispatch
              .runStatus,
        },
        "Campaign finalization check skipped because execution stopped"
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

        results,
      };
    }

    //------------------------------------------------
    // Dispatch Completed
    //------------------------------------------------

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
    } =
      await import(
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

    //------------------------------------------------
    // Result
    //------------------------------------------------

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
    campaignId:
      string;

    campaignRunId:
      string;

    total:
      number;

    processed:
      number;

    successful:
      number;

    failed:
      number;
  }
): Promise<void> {
  const log =
    createCampaignLogger(
      input.campaignId,
      input.campaignRunId
    );

  try {
    //------------------------------------------------
    // Conditional Progress Write
    //------------------------------------------------

    const updated =
      await prisma.campaignRun
        .updateMany({
          where: {
            id:
              input.campaignRunId,

            campaignId:
              input.campaignId,

            status:
              CampaignRunStatus.RUNNING,
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

    //------------------------------------------------
    // Run Is No Longer Active
    //------------------------------------------------

    if (
      updated.count ===
      0
    ) {
      log.debug(
        {
          event:
            "campaign.progress.skipped",

          reason:
            "run_no_longer_running",

          total:
            input.total,

          processed:
            input.processed,

          successful:
            input.successful,

          failed:
            input.failed,
        },
        "Campaign progress update skipped because run is no longer active"
      );

      return;
    }

    //------------------------------------------------
    // Progress Persisted
    //------------------------------------------------

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
// Read Campaign Execution State
//--------------------------------------------------

async function readCampaignExecutionState(
  campaignId:
    string,

  campaignRunId:
    string
): Promise<{
  campaignStatus:
    CampaignStatus | null;

  runStatus:
    CampaignRunStatus | null;
}> {
  const [
    campaign,
    campaignRun,
  ] =
    await Promise.all([
      prisma.campaign.findUnique({
        where: {
          id:
            campaignId,
        },

        select: {
          status:
            true,
        },
      }),

      prisma.campaignRun.findUnique({
        where: {
          id:
            campaignRunId,
        },

        select: {
          status:
            true,
        },
      }),
    ]);

  return {
    campaignStatus:
      campaign?.status ??
      null,

    runStatus:
      campaignRun?.status ??
      null,
  };
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

  return /^\+?[1-9]\d{9,14}$/.test(
    normalized
  );
}

//--------------------------------------------------
// Read Required Environment Variable
//--------------------------------------------------

function getRequiredEnvironmentVariable(
  name:
    string
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
  error:
    unknown
): {
  name:
    string;

  message:
    string;

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