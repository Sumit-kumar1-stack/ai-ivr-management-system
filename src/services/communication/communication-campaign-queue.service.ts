import {
  Queue,
} from "bullmq";

import {
  redisConnection,
} from "@/lib/redis";

import {
  readQueueDiagnosticCounts,
} from "@/services/queues/queue-diagnostics.types";

//--------------------------------------------------
// Queue
//--------------------------------------------------

export const COMMUNICATION_QUEUE_NAME =
  "communication-campaign-processing";

export const COMMUNICATION_JOB_NAME =
  "run-communication-campaign";

export const COMMUNICATION_RECIPIENT_JOB_NAME =
  "run-communication-campaign-recipient";

export const COMMUNICATION_FALLBACK_JOB_NAME =
  "whatsapp-sms-fallback";

//--------------------------------------------------
// Limits
//--------------------------------------------------

const MAX_DELAY_MS =
  30 *
  24 *
  60 *
  60 *
  1000;

//--------------------------------------------------
// Campaign Job
//--------------------------------------------------

export interface CommunicationCampaignJobData {
  communicationCampaignId:
    string;
}

export interface CommunicationRecipientAttemptJobData {
  jobVersion:
    1;

  tenantId:
    string;

  campaignId:
    string;

  campaignRecipientId:
    string;

  contactId:
    string;

  attemptNumber:
    number;

  scheduledFor:
    string;
}

//--------------------------------------------------
// Fallback Job
//--------------------------------------------------

export interface CommunicationFallbackJobData {
  outboundMessageId:
    string;
}

export type CommunicationJobData =
  | CommunicationCampaignJobData
  | CommunicationRecipientAttemptJobData
  | CommunicationFallbackJobData;

export function buildCommunicationRecipientAttemptJobId(
  data: Pick<
    CommunicationRecipientAttemptJobData,
    "campaignId" | "campaignRecipientId" | "attemptNumber"
  >
): string {
  return [
    "outbound-call",
    data.campaignId.trim(),
    data.campaignRecipientId.trim(),
    data.attemptNumber,
  ].join("-");
}

//--------------------------------------------------
// Queue State
//
// Keep the BullMQ Queue lazy so importing a Next.js
// route during `next build` cannot activate Redis.
//--------------------------------------------------

let communicationCampaignQueue:
  Queue<CommunicationJobData> |
  null =
    null;

//--------------------------------------------------
// Get Queue
//--------------------------------------------------

function getCommunicationCampaignQueue():
  Queue<CommunicationJobData> {
  if (
    communicationCampaignQueue
  ) {
    return communicationCampaignQueue;
  }

  communicationCampaignQueue =
    new Queue<
      CommunicationJobData
    >(
      COMMUNICATION_QUEUE_NAME,
      {
        connection:
          redisConnection,

        defaultJobOptions: {
          attempts:
            3,

          backoff: {
            type:
              "exponential",

            delay:
              5_000,
          },

          removeOnComplete: {
            age:
              86_400,

            count:
              1_000,
          },

          removeOnFail: {
            age:
              604_800,

            count:
              5_000,
          },
        },
      }
    );

  return communicationCampaignQueue;
}

//--------------------------------------------------
// Service
//--------------------------------------------------

export class CommunicationCampaignQueueService {
  //------------------------------------------------
  // Read-Only Diagnostics
  //------------------------------------------------

  static async getReadOnlyCounts() {
    return readQueueDiagnosticCounts(
      getCommunicationCampaignQueue()
    );
  }

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

  static async enqueue(
    data:
      CommunicationCampaignJobData,

    delayMs =
      0
  ) {
    const normalizedDelay =
      Math.min(
        MAX_DELAY_MS,
        Math.max(
          0,
          Math.floor(
            Number.isFinite(
              delayMs
            )
              ? delayMs
              : 0
          )
        )
      );

    const queue =
      getCommunicationCampaignQueue();

    const jobId =
      `communication-${data.communicationCampaignId}`;

    const existing =
      await queue.getJob(
        jobId
      );

    if (existing) {
      const state =
        await existing.getState();

      if (
        state === "completed" ||
        state === "failed"
      ) {
        await existing.remove();
      } else {
        return existing;
      }
    }

    return queue.add(
      COMMUNICATION_JOB_NAME,
      data,
      {
        jobId,

        delay:
          normalizedDelay,
      }
    );
  }

  //------------------------------------------------
  // Recipient Attempt
  //------------------------------------------------

  static async enqueueRecipientAttempt(
    data:
      CommunicationRecipientAttemptJobData,

    delayMs =
      0
  ) {
    if (
      data.jobVersion !==
      1
    ) {
      throw new Error(
        "Communication recipient job version is unsupported"
      );
    }

    const tenantId =
      data
        .tenantId
        .trim();

    const campaignId =
      data
        .campaignId
        .trim();

    const campaignRecipientId =
      data
        .campaignRecipientId
        .trim();

    const contactId =
      data
        .contactId
        .trim();

    const attemptNumber =
      Number.isFinite(
        Number(
          data.attemptNumber
        )
      )
        ? Math.max(
            1,
            Math.floor(
              Number(
                data
                  .attemptNumber
              )
            )
          )
        : 1;

    const scheduledFor =
      data.scheduledFor
        .trim();

    if (
      !tenantId ||
      !campaignId ||
      !campaignRecipientId ||
      !contactId ||
      !scheduledFor
    ) {
      throw new Error(
        "Communication recipient attempt job is missing required fields"
      );
    }

    const normalizedDelay =
      Math.min(
        MAX_DELAY_MS,
        Math.max(
          0,
          Math.floor(
            Number.isFinite(
              delayMs
            )
              ? delayMs
              : 0
          )
        )
      );

    const queue =
      getCommunicationCampaignQueue();

    const jobId =
      buildCommunicationRecipientAttemptJobId({
        campaignId,
        campaignRecipientId,
        attemptNumber,
      });

    const existing =
      await queue.getJob(
        jobId
      );

    if (existing) {
      const state =
        await existing.getState();

      if (
        state === "completed" ||
        state === "failed"
      ) {
        await existing.remove();
      } else {
        return existing;
      }
    }

    return queue.add(
      COMMUNICATION_RECIPIENT_JOB_NAME,
      {
        jobVersion:
          1,

        tenantId,

        campaignId,

        campaignRecipientId,

        contactId,

        attemptNumber,

        scheduledFor,
      },
      {
        jobId,

        delay:
          normalizedDelay,
      }
    );
  }

  //------------------------------------------------
  // Cancel Pending Work
  //------------------------------------------------

  static async removePendingCampaignJobs(
    campaignId: string
  ): Promise<number> {
    const id = campaignId.trim();

    if (!id) {
      throw new Error(
        "Communication campaign ID is required"
      );
    }

    const queue =
      getCommunicationCampaignQueue();

    const jobs =
      await queue.getJobs([
        "wait",
        "delayed",
        "paused",
      ]);

    let removed = 0;

    for (const job of jobs) {
      const data =
        job.data as CommunicationJobData;

      const matchesCampaign =
        (
          "communicationCampaignId" in data &&
          data.communicationCampaignId === id
        ) ||
        (
          "campaignId" in data &&
          data.campaignId === id
        );

      if (!matchesCampaign) {
        continue;
      }

      await job.remove();
      removed += 1;
    }

    return removed;
  }

  //------------------------------------------------
  // WhatsApp -> SMS Fallback
  //------------------------------------------------

  static async enqueueWhatsAppSmsFallback(
    outboundMessageId:
      string
  ) {
    const id =
      outboundMessageId
        .trim();

    if (
      !id
    ) {
      throw new Error(
        "Outbound message ID is required for fallback"
      );
    }

    const queue =
      getCommunicationCampaignQueue();

    return queue.add(
      COMMUNICATION_FALLBACK_JOB_NAME,
      {
        outboundMessageId:
          id,
      },
      {
        jobId:
          `whatsapp-sms-fallback-${id}`,
      }
    );
  }

  //------------------------------------------------
  // Close
  //------------------------------------------------

  static async close():
    Promise<void> {
    const queue =
      communicationCampaignQueue;

    communicationCampaignQueue =
      null;

    /*
     * Do not instantiate a queue merely to close it.
     * This keeps shutdown/build imports side-effect free.
     */
    if (
      !queue
    ) {
      return;
    }

    await queue.close();
  }
}
