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
import {
  recordCommunicationCampaignMaterialChange,
  type CommunicationCampaignMaterialChangeActor,
} from "@/services/communication/communication-campaign-material-change.service";

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
// Replace Snapshot
//--------------------------------------------------

const replaceRecipientBatchSchema =
  recipientBatchSchema
    .extend({
      campaignName:
        z
          .string()
          .trim()
          .min(
            3
          )
          .max(
            120
          )
          .optional(),

      audienceSourceId:
        z
          .string()
          .trim()
          .min(
            1
          )
          .max(
            200
          )
          .optional(),

      audienceSourceName:
        z
          .string()
          .trim()
          .min(
            1
          )
          .max(
            255
          )
          .optional(),
    });

//--------------------------------------------------
// Input
//--------------------------------------------------

export type CommunicationRecipientInput =
  z.infer<
    typeof communicationRecipientSchema
  >;

//--------------------------------------------------
// List
//--------------------------------------------------

export async function listCommunicationRecipients(
  campaignId:
    string
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
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  const [
    recipients,
    total,
  ] =
    await Promise.all([
      prisma
        .communicationCampaignRecipient
        .findMany({
          where: {
            campaignId:
              id,
          },

          orderBy: {
            createdAt:
              "asc",
          },

          select: {
            id:
              true,

            externalRecipientId:
              true,

            fullName:
              true,

            phone:
              true,

            language:
              true,

            status:
              true,

            lastError:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },
        }),

      prisma
        .communicationCampaignRecipient
        .count({
          where: {
            campaignId:
              id,
          },
        }),
    ]);

  return {
    recipients:
      recipients.map(
        recipient => ({
          ...recipient,

          createdAt:
            recipient
              .createdAt
              .toISOString(),

          updatedAt:
            recipient
              .updatedAt
              .toISOString(),
        })
      ),

    total,
  };
}

//--------------------------------------------------
// Ingest / Append
//--------------------------------------------------

export async function ingestCommunicationRecipients(
  campaignId:
    string,

  rawInput:
    unknown,

  user?:
    CommunicationCampaignMaterialChangeActor
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

  await assertCampaignRecipientsEditable(
    id
  );

  const recipients =
    normalizeAndDeduplicateRecipients(
      input.recipients
    );

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

  if (
    inserted.count > 0 &&
    user
  ) {
    await recordCommunicationCampaignMaterialChange(
      id,
      user
    );
  }

  return {
    inserted:
      inserted.count,

    duplicates:
      recipients.length -
      inserted.count,

    total,
  };
}

//--------------------------------------------------
// Replace Audience Snapshot
//--------------------------------------------------

export async function replaceCommunicationRecipients(
  campaignId:
    string,

  rawInput:
    unknown,

  user?:
    CommunicationCampaignMaterialChangeActor
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
    replaceRecipientBatchSchema
      .parse(
        rawInput
      );

  await assertCampaignRecipientsEditable(
    id
  );

  const recipients =
    normalizeAndDeduplicateRecipients(
      input.recipients
    );

  const result =
    await prisma
      .$transaction(
        async transaction => {
          await transaction
            .communicationCampaignRecipient
            .deleteMany({
              where: {
                campaignId:
                  id,
              },
            });

          const inserted =
            await transaction
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

          await transaction
            .communicationCampaign
            .update({
              where: {
                id,
              },

              data: {
                recipientCount:
                  inserted.count,

                ...(input.campaignName
                  ? {
                      name:
                        input.campaignName,
                    }
                  : {}),

                ...(input.audienceSourceId
                  ? {
                      audienceSourceId:
                        input.audienceSourceId,
                    }
                  : {}),

                ...(input.audienceSourceName
                  ? {
                      audienceSourceName:
                        input.audienceSourceName,
                    }
                  : {}),
              },
            });

          return {
            inserted:
              inserted.count,
          };
      }
    );

  if (user) {
    await recordCommunicationCampaignMaterialChange(
      id,
      user
    );
  }

  return {
    inserted:
      result.inserted,

    duplicates:
      recipients.length -
      result.inserted,

    total:
      result.inserted,
  };
}

//--------------------------------------------------
// Editable Guard
//--------------------------------------------------

async function assertCampaignRecipientsEditable(
  campaignId:
    string
): Promise<void> {
  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id:
            campaignId,
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
}

//--------------------------------------------------
// Normalize + Deduplicate
//--------------------------------------------------

function normalizeAndDeduplicateRecipients(
  inputRecipients:
    CommunicationRecipientInput[]
) {
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
    of inputRecipients
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

  return [
    ...recipientMap.values(),
  ];
}
