import {
  CommunicationCampaignStatus,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  normalizeMessagingPhoneNumber,
} from "@/services/messaging/messaging-consent.service";

//--------------------------------------------------
// Recipient
//--------------------------------------------------

const communicationRecipientSchema =
  z.object({
    externalRecipientId:
      z
        .string()
        .trim()
        .max(
          200
        )
        .optional(),

    fullName:
      z
        .string()
        .trim()
        .max(
          200
        )
        .optional(),

    phone:
      z
        .string()
        .trim()
        .min(
          8
        )
        .max(
          20
        ),

    language:
      z
        .string()
        .trim()
        .min(
          2
        )
        .max(
          50
        )
        .default(
          "English"
        ),
  });

//--------------------------------------------------
// Batch
//--------------------------------------------------

const recipientBatchSchema =
  z.object({
    recipients:
      z
        .array(
          communicationRecipientSchema
        )
        .min(
          1
        )
        .max(
          1000
        ),
  });

//--------------------------------------------------
// Input
//--------------------------------------------------

export type CommunicationRecipientInput =
  z.infer<
    typeof communicationRecipientSchema
  >;

//--------------------------------------------------
// Ingest
//--------------------------------------------------

export async function ingestCommunicationRecipients(
  campaignId:
    string,

  rawInput:
    unknown
) {
  const id =
    campaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const input =
    recipientBatchSchema.parse(
      rawInput
    );

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id,
        },

        select: {
          id:
            true,

          status:
            true,
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  if (
    campaign.status !==
      CommunicationCampaignStatus.DRAFT &&
    campaign.status !==
      CommunicationCampaignStatus.READY
  ) {
    throw new Error(
      `Recipients cannot be changed while campaign status is ${campaign.status}`
    );
  }

  //------------------------------------------------
  // Normalize + Deduplicate Batch
  //------------------------------------------------

  const recipientMap =
    new Map<
      string,
      {
        externalRecipientId:
          string | null;

        fullName:
          string | null;

        phone:
          string;

        language:
          string;
      }
    >();

  for (
    const recipient
    of input.recipients
  ) {
    const phone =
      normalizeMessagingPhoneNumber(
        recipient.phone
      );

    if (
      !phone
    ) {
      throw new Error(
        `Invalid recipient phone number: ${recipient.phone}`
      );
    }

    recipientMap.set(
      phone,
      {
        externalRecipientId:
          recipient
            .externalRecipientId ??
          null,

        fullName:
          recipient
            .fullName ??
          null,

        phone,

        language:
          recipient.language,
      }
    );
  }

  const recipients =
    [
      ...recipientMap.values(),
    ];

  //------------------------------------------------
  // Store Snapshot
  //------------------------------------------------

  const inserted =
    await prisma
      .communicationCampaignRecipient
      .createMany({
        data:
          recipients.map(
            recipient => ({
              campaignId:
                id,

              externalRecipientId:
                recipient
                  .externalRecipientId,

              fullName:
                recipient
                  .fullName,

              phone:
                recipient.phone,

              language:
                recipient.language,
            })
          ),

        skipDuplicates:
          true,
      });

  //------------------------------------------------
  // Actual Recipient Count
  //------------------------------------------------

  const total =
    await prisma
      .communicationCampaignRecipient
      .count({
        where: {
          campaignId:
            id,
        },
      });

  await prisma
    .communicationCampaign
    .update({
      where: {
        id,
      },

      data: {
        recipientCount:
          total,
      },
    });

  return {
    inserted:
      inserted.count,

    duplicates:
      recipients.length -
      inserted.count,

    total,
  };
}