import {
  Queue,
} from "bullmq";

import {
  redisConnection,
} from "@/lib/redis";

//--------------------------------------------------
// Queue
//--------------------------------------------------

export const COMMUNICATION_QUEUE_NAME =
  "communication-campaign-processing";

export const COMMUNICATION_JOB_NAME =
  "run-communication-campaign";

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

//--------------------------------------------------
// Fallback Job
//--------------------------------------------------

export interface CommunicationFallbackJobData {
  outboundMessageId:
    string;
}

export type CommunicationJobData =
  | CommunicationCampaignJobData
  | CommunicationFallbackJobData;

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

    return queue.add(
      COMMUNICATION_JOB_NAME,
      data,
      {
        jobId:
          `communication-${data.communicationCampaignId}`,

        delay:
          normalizedDelay,
      }
    );
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