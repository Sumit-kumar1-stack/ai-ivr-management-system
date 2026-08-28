import {
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
} from "@/lib/logger";

import {
  tryFinalizeCommunicationCampaign,
} from "@/services/communication/communication-campaign-finalizer.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "outbound-message-status"
  );

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface OutboundMessageStatusUpdateResult {
  found:
    boolean;

  updated:
    boolean;

  outboundMessageId?:
    string;

  previousStatus?:
    OutboundMessageStatus;

  currentStatus?:
    OutboundMessageStatus;
}

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface UpdateOutboundMessageStatusInput {
  providerMessageId:
    string;

  status:
    OutboundMessageStatus;

  occurredAt?:
    Date;

  errorCode?:
    string;

  errorMessage?:
    string;
}

//--------------------------------------------------
// Status Rank
//--------------------------------------------------

function statusRank(
  status:
    OutboundMessageStatus
): number {
  switch (
    status
  ) {
    case OutboundMessageStatus.PROCESSING:
      return 10;

    case OutboundMessageStatus.ACCEPTED:
      return 20;

    case OutboundMessageStatus.QUEUED:
      return 30;

    case OutboundMessageStatus.SENT:
      return 40;

    case OutboundMessageStatus.DELIVERED:
      return 50;

    case OutboundMessageStatus.READ:
      return 60;

    case OutboundMessageStatus.FAILED:
    case OutboundMessageStatus.UNDELIVERED:
      return 90;

    default:
      return 0;
  }
}

//--------------------------------------------------
// Failure Status
//--------------------------------------------------

function isFailureStatus(
  status:
    OutboundMessageStatus
): boolean {
  return (
    status ===
      OutboundMessageStatus.FAILED ||
    status ===
      OutboundMessageStatus.UNDELIVERED
  );
}

//--------------------------------------------------
// Transition Allowed
//--------------------------------------------------

function canTransition(
  current:
    OutboundMessageStatus,

  incoming:
    OutboundMessageStatus
): boolean {
  //------------------------------------------------
  // Duplicate
  //------------------------------------------------

  if (
    current ===
    incoming
  ) {
    return false;
  }

  //------------------------------------------------
  // READ Is Final Successful State
  //------------------------------------------------

  if (
    current ===
      OutboundMessageStatus.READ
  ) {
    return false;
  }

  //------------------------------------------------
  // Existing Failure Is Terminal
  //------------------------------------------------

  if (
    isFailureStatus(
      current
    )
  ) {
    return false;
  }

  //------------------------------------------------
  // Incoming Failure
  //------------------------------------------------

if (
  isFailureStatus(
    incoming
  )
) {
  /*
   * READ was already handled above.
   *
   * Do not let a late failure overwrite a message
   * already known to have been delivered.
   */

  return (
    current !==
      OutboundMessageStatus.DELIVERED
  );
}

  //------------------------------------------------
  // Forward-Only Successful Lifecycle
  //------------------------------------------------

  return (
    statusRank(
      incoming
    ) >
    statusRank(
      current
    )
  );
}

//--------------------------------------------------
// Update Outbound Message Status
//--------------------------------------------------

export async function updateOutboundMessageStatus(
  input:
    UpdateOutboundMessageStatusInput
): Promise<OutboundMessageStatusUpdateResult> {
  const providerMessageId =
    input.providerMessageId
      .trim();

  if (
    !providerMessageId
  ) {
    return {
      found:
        false,

      updated:
        false,
    };
  }

  const occurredAt =
    input.occurredAt ??
    new Date();

  //------------------------------------------------
  // Compare-And-Swap Retry Loop
  //------------------------------------------------

  for (
    let attempt =
      0;
    attempt <
      4;
    attempt +=
      1
  ) {
    const existing =
      await prisma
        .outboundMessage
        .findUnique({
          where: {
            providerMessageId,
          },

          select: {
            id:
              true,

            status:
              true,

            sentAt:
              true,

            deliveredAt:
              true,

            readAt:
              true,

            failedAt:
              true,

            communicationCampaignId:
              true,
          },
        });

    //------------------------------------------------
    // Unknown Message
    //------------------------------------------------

    if (
      !existing
    ) {
      return {
        found:
          false,

        updated:
          false,
      };
    }

    //------------------------------------------------
    // Duplicate / Regression
    //------------------------------------------------

    if (
      !canTransition(
        existing.status,
        input.status
      )
    ) {
      return {
        found:
          true,

        updated:
          false,

        outboundMessageId:
          existing.id,

        previousStatus:
          existing.status,

        currentStatus:
          existing.status,
      };
    }

    //------------------------------------------------
    // Build Atomic Update
    //------------------------------------------------

    const data:
      Prisma.OutboundMessageUpdateManyMutationInput =
      {
        status:
          input.status,
      };

    //------------------------------------------------
    // SENT
    //------------------------------------------------

    if (
      input.status ===
        OutboundMessageStatus.SENT
    ) {
      data.sentAt =
        existing.sentAt ??
        occurredAt;

      data.errorCode =
        null;

      data.errorMessage =
        null;
    }

    //------------------------------------------------
    // DELIVERED
    //------------------------------------------------

    if (
      input.status ===
        OutboundMessageStatus.DELIVERED
    ) {
      data.sentAt =
        existing.sentAt ??
        occurredAt;

      data.deliveredAt =
        existing.deliveredAt ??
        occurredAt;

      data.errorCode =
        null;

      data.errorMessage =
        null;
    }

    //------------------------------------------------
    // READ
    //------------------------------------------------

    if (
      input.status ===
        OutboundMessageStatus.READ
    ) {
      data.sentAt =
        existing.sentAt ??
        occurredAt;

      data.deliveredAt =
        existing.deliveredAt ??
        occurredAt;

      data.readAt =
        existing.readAt ??
        occurredAt;

      data.errorCode =
        null;

      data.errorMessage =
        null;
    }

    //------------------------------------------------
    // FAILED / UNDELIVERED
    //------------------------------------------------

    if (
      isFailureStatus(
        input.status
      )
    ) {
      data.failedAt =
        existing.failedAt ??
        occurredAt;

      data.errorCode =
        input.errorCode
          ?.trim()
          .slice(
            0,
            200
          ) ||
        (
          input.status ===
            OutboundMessageStatus.UNDELIVERED
            ? "MESSAGE_UNDELIVERED"
            : "MESSAGE_FAILED"
        );

      data.errorMessage =
        input.errorMessage
          ?.trim()
          .slice(
            0,
            500
          ) ||
        "Messaging provider reported delivery failure.";
    }

    //------------------------------------------------
    // Compare-And-Swap
    //------------------------------------------------

    const updated =
      await prisma
        .outboundMessage
        .updateMany({
          where: {
            id:
              existing.id,

            status:
              existing.status,
          },

          data,
        });

    //------------------------------------------------
    // Updated Successfully
    //------------------------------------------------

    if (
      updated.count ===
      1
    ) {
      log.info(
        {
          event:
            "messaging.status.transitioned",

          outboundMessageId:
            existing.id,

          previousStatus:
            existing.status,

          currentStatus:
            input.status,

          attempt:
            attempt +
            1,
        },
        "Outbound message status transitioned"
      );

      await tryFinalizeCommunicationCampaign(
        existing
          .communicationCampaignId
      );

      return {
        found:
          true,

        updated:
          true,

        outboundMessageId:
          existing.id,

        previousStatus:
          existing.status,

        currentStatus:
          input.status,
      };
    }

    /*
     * Another webhook changed the same row between
     * our read and update. Retry against fresh state.
     */
  }

  //--------------------------------------------------
  // Retry Exhausted
  //--------------------------------------------------

  log.warn(
    {
      event:
        "messaging.status.concurrent_retry_exhausted",

      providerMessageId,
    },
    "Outbound message status transition could not be resolved after concurrent updates"
  );

  return {
    found:
      true,

    updated:
      false,
  };
}