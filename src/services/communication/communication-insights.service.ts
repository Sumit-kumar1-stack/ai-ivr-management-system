import {
  CallStatus,
  CommunicationChannel,
  MessagingChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  applyCommunicationAnalyticsEntitlement,
} from "./communication-analytics-access.service";

import type {
  CommunicationCampaignInsightsDTO,
  CommunicationChannelMixDTO,
  CommunicationRecipientInsightDTO,
  CommunicationRecipientOverallStatus,
  RecipientChannelInsightDTO,
  UnifiedChannelStatus,
} from "@/types/communication-insights";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface GetCommunicationCampaignInsightsInput {
  campaignId:
    string;

  page?:
    number;

  pageSize?:
    number;
}

//--------------------------------------------------
// Internal Message
//--------------------------------------------------

interface RecipientMessageRecord {
  id:
    string;

  channel:
    MessagingChannel;

  status:
    OutboundMessageStatus;

  errorMessage:
    string | null;

  acceptedAt:
    Date | null;

  sentAt:
    Date | null;

  deliveredAt:
    Date | null;

  readAt:
    Date | null;

  failedAt:
    Date | null;

  createdAt:
    Date;

  updatedAt:
    Date;
}

//--------------------------------------------------
// Internal Call
//--------------------------------------------------

interface RecipientCallRecord {
  id:
    string;

  campaignId:
    string | null;

  status:
    CallStatus;

  duration:
    number | null;

  attemptNumber:
    number;

  retryReason:
    string | null;

  queuedAt:
    Date | null;

  ringingAt:
    Date | null;

  answeredAt:
    Date | null;

  completedAt:
    Date | null;

  failedAt:
    Date | null;

  createdAt:
    Date;

  updatedAt:
    Date;

  contact: {
    phone:
      string;
  } | null;
}

//--------------------------------------------------
// Main Query
//--------------------------------------------------

export async function getCommunicationCampaignInsights(
  input:
    GetCommunicationCampaignInsightsInput
): Promise<CommunicationCampaignInsightsDTO> {
  const campaignId =
    input.campaignId
      .trim();

  if (
    !campaignId
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const page =
    clampInteger(
      input.page ??
      1,
      1,
      1_000_000
    );

  const pageSize =
    clampInteger(
      input.pageSize ??
      25,
      1,
      100
    );

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

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

          name:
            true,

          audienceSourceName:
            true,

          recipientCount:
            true,

          tier:
            true,

          status:
            true,

          channels:
            true,

          fallbackPolicy:
            true,

          scheduledAt:
            true,

          createdAt:
            true,

          voiceCampaignId:
            true,

          ivrCampaignId:
            true,

          ivrFlow: {
            select: {
              id:
                true,

              name:
                true,

              version:
                true,
            },
          },

          _count: {
            select: {
              recipients:
                true,
            },
          },
        },
      });

  if (
    !campaign
  ) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  const totalRecipients =
    campaign
      ._count
      .recipients;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalRecipients /
        pageSize
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  //------------------------------------------------
  // Recipient Page
  //------------------------------------------------

  const recipients =
    await prisma
      .communicationCampaignRecipient
      .findMany({
        where: {
          campaignId:
            campaign.id,
        },

        orderBy: [
          {
            updatedAt:
              "desc",
          },
          {
            id:
              "asc",
          },
        ],

        skip:
          (
            safePage -
            1
          ) *
          pageSize,

        take:
          pageSize,

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

          messages: {
            orderBy: {
              updatedAt:
                "desc",
            },

            select: {
              id:
                true,

              channel:
                true,

              status:
                true,

              errorMessage:
                true,

              acceptedAt:
                true,

              sentAt:
                true,

              deliveredAt:
                true,

              readAt:
                true,

              failedAt:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },
          },
        },
      });

  //------------------------------------------------
  // Calls For Current Recipient Page
  //------------------------------------------------

  const childCampaignIds =
    [
      campaign
        .voiceCampaignId,
      campaign
        .ivrCampaignId,
    ]
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      );

  const recipientPhones =
    recipients.map(
      recipient =>
        recipient.phone
    );

  let pageCalls:
    RecipientCallRecord[] =
      [];

  if (
    childCampaignIds.length >
      0 &&
    recipientPhones.length >
      0
  ) {
    pageCalls =
      await prisma
        .call
        .findMany({
          where: {
            campaignId: {
              in:
                childCampaignIds,
            },

            contact: {
              phone: {
                in:
                  recipientPhones,
              },
            },
          },

          orderBy: [
            {
              attemptNumber:
                "desc",
            },
            {
              updatedAt:
                "desc",
            },
          ],

          select: {
            id:
              true,

            campaignId:
              true,

            status:
              true,

            duration:
              true,

            attemptNumber:
              true,

            retryReason:
              true,

            queuedAt:
              true,

            ringingAt:
              true,

            answeredAt:
              true,

            completedAt:
              true,

            failedAt:
              true,

            createdAt:
              true,

            updatedAt:
              true,

            contact: {
              select: {
                phone:
                  true,
              },
            },
          },
        });
  }

  //------------------------------------------------
  // Aggregate Message Metrics
  //------------------------------------------------

  const messageGroups =
    await prisma
      .outboundMessage
      .groupBy({
        by: [
          "channel",
          "status",
        ],

        where: {
          communicationCampaignId:
            campaign.id,
        },

        _count: {
          id:
            true,
        },
      });

  //------------------------------------------------
  // Aggregate Call Metrics
  //------------------------------------------------

  const callGroups =
    childCampaignIds.length >
      0
      ? await prisma
          .call
          .groupBy({
            by: [
              "campaignId",
              "status",
            ],

            where: {
              campaignId: {
                in:
                  childCampaignIds,
              },
            },

            _count: {
              id:
                true,

              duration:
                true,
            },

            _avg: {
              duration:
                true,
            },
          })
      : [];

  //------------------------------------------------
  // Conversion / Consent / Open Timing
  //------------------------------------------------

  const [
    converted,
    unsubscribed,
    averageTimeToOpenSeconds,
  ] =
    await Promise.all([
      getConvertedLeadCount(
        childCampaignIds
      ),

      getOptedOutRecipientCount(
        campaign.id
      ),

      getAverageWhatsAppOpenSeconds(
        campaign.id
      ),
    ]);

  //------------------------------------------------
  // Messaging Aggregates
  //------------------------------------------------

  let messageAttempts =
    0;

  let messageDelivered =
    0;

  let messageRead =
    0;

  let messageFailures =
    0;

  const smsAggregate =
    createMutableAggregate();

  const whatsappAggregate =
    createMutableAggregate();

  for (
    const group
    of messageGroups
  ) {
    const count =
      group
        ._count
        .id;

    messageAttempts +=
      count;

    if (
      isMessageDelivered(
        group.status
      )
    ) {
      messageDelivered +=
        count;
    }

    if (
      group.status ===
      OutboundMessageStatus.READ
    ) {
      messageRead +=
        count;
    }

    if (
      isMessageFailure(
        group.status
      )
    ) {
      messageFailures +=
        count;
    }

    const aggregate =
      group.channel ===
        MessagingChannel.SMS
        ? smsAggregate
        : whatsappAggregate;

    aggregate.attempts +=
      count;

    if (
      isMessageDelivered(
        group.status
      )
    ) {
      aggregate.successful +=
        count;
    }

    if (
      isMessageFailure(
        group.status
      )
    ) {
      aggregate.failed +=
        count;
    }
  }

  //------------------------------------------------
  // Call Aggregates
  //------------------------------------------------

  let callAttempts =
    0;

  let callReached =
    0;

  let callFailures =
    0;

  const aiVoiceAggregate =
    createMutableAggregate();

  const ivrAggregate =
    createMutableAggregate();

  let aiVoiceDurationWeighted =
    0;

  let aiVoiceDurationCount =
    0;

  let ivrDurationWeighted =
    0;

  let ivrDurationCount =
    0;

  for (
    const group
    of callGroups
  ) {
    const count =
      group
        ._count
        .id;

    callAttempts +=
      count;

    if (
      isCallReached(
        group.status
      )
    ) {
      callReached +=
        count;
    }

    if (
      isCallFailure(
        group.status
      )
    ) {
      callFailures +=
        count;
    }

    const isAiVoice =
      group.campaignId ===
      campaign.voiceCampaignId;

    const aggregate =
      isAiVoice
        ? aiVoiceAggregate
        : ivrAggregate;

    aggregate.attempts +=
      count;

    if (
      isCallReached(
        group.status
      )
    ) {
      aggregate.successful +=
        count;
    }

    if (
      isCallFailure(
        group.status
      )
    ) {
      aggregate.failed +=
        count;
    }

    if (
      group
        ._avg
        .duration !==
        null
    ) {
      if (
        isAiVoice
      ) {
        const durationCount =
          group
            ._count
            .duration;

        aiVoiceDurationWeighted +=
          group
            ._avg
            .duration *
          durationCount;

        aiVoiceDurationCount +=
          durationCount;
      } else {
        const durationCount =
          group
            ._count
            .duration;

        ivrDurationWeighted +=
          group
            ._avg
            .duration *
          durationCount;

        ivrDurationCount +=
          durationCount;
      }
    }
  }

  //------------------------------------------------
  // Recipient Call Index
  //------------------------------------------------

  const callsByKey =
    new Map<
      string,
      RecipientCallRecord[]
    >();

  for (
    const call
    of pageCalls
  ) {
    if (!call.campaignId || !call.contact) {
      continue;
    }
    const key =
      buildCallKey(
        call.campaignId,
        call.contact.phone
      );

    const bucket =
      callsByKey.get(
        key
      ) ??
      [];

    bucket.push(
      call
    );

    callsByKey.set(
      key,
      bucket
    );
  }

  //------------------------------------------------
  // Recipient DTOs
  //------------------------------------------------

  const recipientInsights =
    recipients.map(
      recipient =>
        mapRecipientInsight({
          recipient,
          campaignChannels:
            campaign.channels,
          fallbackPolicy:
            campaign.fallbackPolicy,
          voiceCampaignId:
            campaign.voiceCampaignId,
          ivrCampaignId:
            campaign.ivrCampaignId,
          callsByKey,
        })
    );

  //------------------------------------------------
  // Channel Mix
  //------------------------------------------------

  const channelMix:
    CommunicationChannelMixDTO[] =
      [
        toChannelMix({
          channel:
            CommunicationChannel.SMS,

          selected:
            campaign.channels
              .includes(
                CommunicationChannel.SMS
              ),

          aggregate:
            smsAggregate,

          averageDurationSeconds:
            null,
        }),

        toChannelMix({
          channel:
            CommunicationChannel.WHATSAPP,

          selected:
            campaign.channels
              .includes(
                CommunicationChannel.WHATSAPP
              ),

          aggregate:
            whatsappAggregate,

          averageDurationSeconds:
            null,
        }),

        toChannelMix({
          channel:
            CommunicationChannel.AI_VOICE,

          selected:
            campaign.channels
              .includes(
                CommunicationChannel.AI_VOICE
              ),

          aggregate:
            aiVoiceAggregate,

          averageDurationSeconds:
            aiVoiceDurationCount >
              0
              ? Math.round(
                  aiVoiceDurationWeighted /
                  aiVoiceDurationCount
                )
              : null,
        }),

        toChannelMix({
          channel:
            CommunicationChannel.IVR,

          selected:
            campaign.channels
              .includes(
                CommunicationChannel.IVR
              ),

          aggregate:
            ivrAggregate,

          averageDurationSeconds:
            ivrDurationCount >
              0
              ? Math.round(
                  ivrDurationWeighted /
                  ivrDurationCount
                )
              : null,
        }),
      ];

  //------------------------------------------------
  // Plan-Aware Analytics Entitlement
  //------------------------------------------------

  const entitledAnalytics =
    applyCommunicationAnalyticsEntitlement(
      campaign.tier,
      {
        sent:
          messageAttempts +
          callAttempts,

        delivered:
          messageDelivered +
          callReached,

        opened:
          messageRead,

        converted,

        dropped:
          callFailures,

        bounced:
          messageFailures,

        unsubscribed,

        averageTimeToOpenSeconds,
      },
      channelMix
    );

  //------------------------------------------------
  // Final DTO
  //------------------------------------------------

  return {
    analyticsAccess:
      entitledAnalytics.access,
    campaign: {
      id:
        campaign.id,

      name:
        campaign.name,

      audienceSourceName:
        campaign
          .audienceSourceName,

      recipientCount:
        totalRecipients,

      tier:
        campaign.tier,

      status:
        campaign.status,

      channels:
        campaign.channels,

      scheduledAt:
        campaign
          .scheduledAt
          ?.toISOString() ??
        null,

      createdAt:
        campaign
          .createdAt
          .toISOString(),

      voiceCampaignId:
        campaign
          .voiceCampaignId,

      ivrCampaignId:
        campaign
          .ivrCampaignId,

      ivrFlow:
        campaign.ivrFlow,
    },

    metrics:
      entitledAnalytics.metrics,

    channelMix:
      entitledAnalytics.channelMix,

    recipients:
      recipientInsights,

    pagination: {
      page:
        safePage,

      pageSize,

      total:
        totalRecipients,

      totalPages,
    },

    refreshedAt:
      new Date()
        .toISOString(),
  };
}

//--------------------------------------------------
// Recipient Mapper
//--------------------------------------------------

function mapRecipientInsight(
  input: {
    recipient: {
      id:
        string;

      externalRecipientId:
        string | null;

      fullName:
        string | null;

      phone:
        string;

      language:
        string;

      messages:
        RecipientMessageRecord[];
    };

    campaignChannels:
      CommunicationChannel[];

    fallbackPolicy:
      string;

    voiceCampaignId:
      string | null;

    ivrCampaignId:
      string | null;

    callsByKey:
      Map<
        string,
        RecipientCallRecord[]
      >;
  }
): CommunicationRecipientInsightDTO {
  const {
    recipient,
  } =
    input;

  //------------------------------------------------
  // Messaging
  //------------------------------------------------

  const smsMessages =
    recipient
      .messages
      .filter(
        message =>
          message.channel ===
          MessagingChannel.SMS
      );

  const whatsappMessages =
    recipient
      .messages
      .filter(
        message =>
          message.channel ===
          MessagingChannel.WHATSAPP
      );

  const sms =
    mapMessagingChannel({
      selected:
        input
          .campaignChannels
          .includes(
            CommunicationChannel.SMS
          ),
      messages:
        smsMessages,
    });

  const whatsapp =
    mapMessagingChannel({
      selected:
        input
          .campaignChannels
          .includes(
            CommunicationChannel.WHATSAPP
          ),
      messages:
        whatsappMessages,
    });

  //------------------------------------------------
  // AI Voice
  //------------------------------------------------

  const aiVoiceCalls =
    input.voiceCampaignId
      ? input
          .callsByKey
          .get(
            buildCallKey(
              input.voiceCampaignId,
              recipient.phone
            )
          ) ??
        []
      : [];

  const aiVoice =
    mapCallChannel({
      selected:
        input
          .campaignChannels
          .includes(
            CommunicationChannel.AI_VOICE
          ),
      calls:
        aiVoiceCalls,
    });

  //------------------------------------------------
  // IVR
  //------------------------------------------------

  const ivrCalls =
    input.ivrCampaignId
      ? input
          .callsByKey
          .get(
            buildCallKey(
              input.ivrCampaignId,
              recipient.phone
            )
          ) ??
        []
      : [];

  const ivr =
    mapCallChannel({
      selected:
        input
          .campaignChannels
          .includes(
            CommunicationChannel.IVR
          ),
      calls:
        ivrCalls,
    });

  //------------------------------------------------
  // Overall
  //------------------------------------------------

  const channels = {
    SMS:
      sms,

    WHATSAPP:
      whatsapp,

    AI_VOICE:
      aiVoice,

    IVR:
      ivr,
  };

  const overallStatus =
    deriveRecipientOverallStatus(
      Object.values(
        channels
      )
    );

  const lastActivityAt =
    maxIsoDate(
      Object
        .values(
          channels
        )
        .map(
          channel =>
            channel
              .lastActivityAt
        )
    );

  //------------------------------------------------
  // Fallback
  //------------------------------------------------

  const fallbackUsed =
    input.fallbackPolicy ===
      "WHATSAPP_TO_SMS" &&
    smsMessages.length >
      0 &&
    whatsappMessages
      .some(
        message =>
          isMessageFailure(
            message.status
          )
      );

  return {
    id:
      recipient.id,

    externalRecipientId:
      recipient
        .externalRecipientId,

    fullName:
      recipient
        .fullName,

    phoneMasked:
      maskPhone(
        recipient.phone
      ),

    language:
      recipient.language,

    overallStatus,

    fallbackUsed,

    lastActivityAt,

    channels,
  };
}

//--------------------------------------------------
// Messaging Channel
//--------------------------------------------------

function mapMessagingChannel(
  input: {
    selected:
      boolean;

    messages:
      RecipientMessageRecord[];
  }
): RecipientChannelInsightDTO {
  if (
    !input.selected
  ) {
    return emptyChannel(
      "NOT_SELECTED",
      false
    );
  }

  if (
    input.messages.length ===
    0
  ) {
    return emptyChannel(
      "NOT_STARTED",
      true
    );
  }

  const latest =
    [
      ...input.messages,
    ]
      .sort(
        (
          left,
          right
        ) =>
          right
            .updatedAt
            .getTime() -
          left
            .updatedAt
            .getTime()
      )[0];

  return {
    selected:
      true,

    status:
      mapMessageStatus(
        latest.status
      ),

    attempts:
      input
        .messages
        .length,

    lastActivityAt:
      getMessageActivityDate(
        latest
      )
        .toISOString(),

    error:
      latest
        .errorMessage,
  };
}

//--------------------------------------------------
// Call Channel
//--------------------------------------------------

function mapCallChannel(
  input: {
    selected:
      boolean;

    calls:
      RecipientCallRecord[];
  }
): RecipientChannelInsightDTO {
  if (
    !input.selected
  ) {
    return emptyChannel(
      "NOT_SELECTED",
      false
    );
  }

  if (
    input.calls.length ===
    0
  ) {
    return emptyChannel(
      "NOT_STARTED",
      true
    );
  }

  const latest =
    [
      ...input.calls,
    ]
      .sort(
        (
          left,
          right
        ) => {
          if (
            right.attemptNumber !==
            left.attemptNumber
          ) {
            return (
              right.attemptNumber -
              left.attemptNumber
            );
          }

          return (
            right
              .updatedAt
              .getTime() -
            left
              .updatedAt
              .getTime()
          );
        }
      )[0];

  return {
    selected:
      true,

    status:
      mapCallStatus(
        latest.status
      ),

    attempts:
      input
        .calls
        .length,

    lastActivityAt:
      getCallActivityDate(
        latest
      )
        .toISOString(),

    error:
      isCallFailure(
        latest.status
      )
        ? latest
            .retryReason ??
          latest.status
        : null,
  };
}

//--------------------------------------------------
// Overall Recipient Status
//--------------------------------------------------

function deriveRecipientOverallStatus(
  channels:
    RecipientChannelInsightDTO[]
): CommunicationRecipientOverallStatus {
  const selected =
    channels.filter(
      channel =>
        channel.selected
    );

  if (
    selected.length ===
    0
  ) {
    return "PENDING";
  }

  const reachedStates:
    UnifiedChannelStatus[] =
      [
        "DELIVERED",
        "READ",
        "ANSWERED",
        "COMPLETED",
      ];

  if (
    selected.some(
      channel =>
        reachedStates
          .includes(
            channel.status
          )
    )
  ) {
    return "REACHED";
  }

  const activeStates:
    UnifiedChannelStatus[] =
      [
        "PROCESSING",
        "QUEUED",
        "SENT",
        "RINGING",
      ];

  if (
    selected.some(
      channel =>
        activeStates
          .includes(
            channel.status
          )
    )
  ) {
    return "ACTIVE";
  }

  const failureStates:
    UnifiedChannelStatus[] =
      [
        "FAILED",
        "BUSY",
        "NO_ANSWER",
        "CANCELED",
      ];

  const everyFinishedAsFailure =
    selected.every(
      channel =>
        failureStates
          .includes(
            channel.status
          )
    );

  if (
    everyFinishedAsFailure
  ) {
    return "FAILED";
  }

  return "PENDING";
}

//--------------------------------------------------
// Message Status Mapping
//--------------------------------------------------

function mapMessageStatus(
  status:
    OutboundMessageStatus
): UnifiedChannelStatus {
  switch (
    status
  ) {
    case OutboundMessageStatus.PROCESSING:
      return "PROCESSING";

    case OutboundMessageStatus.ACCEPTED:
    case OutboundMessageStatus.QUEUED:
      return "QUEUED";

    case OutboundMessageStatus.SENT:
      return "SENT";

    case OutboundMessageStatus.DELIVERED:
      return "DELIVERED";

    case OutboundMessageStatus.READ:
      return "READ";

    case OutboundMessageStatus.FAILED:
    case OutboundMessageStatus.UNDELIVERED:
      return "FAILED";
  }
}

//--------------------------------------------------
// Call Status Mapping
//--------------------------------------------------

function mapCallStatus(
  status:
    CallStatus
): UnifiedChannelStatus {
  switch (
    status
  ) {
    case CallStatus.QUEUED:
      return "QUEUED";

    case CallStatus.RINGING:
      return "RINGING";

    case CallStatus.ANSWERED:
      return "ANSWERED";

    case CallStatus.COMPLETED:
      return "COMPLETED";

    case CallStatus.FAILED:
      return "FAILED";

    case CallStatus.BUSY:
      return "BUSY";

    case CallStatus.NO_ANSWER:
      return "NO_ANSWER";

    case CallStatus.CANCELED:
      return "CANCELED";
  }
}

//--------------------------------------------------
// Status Helpers
//--------------------------------------------------

function isMessageDelivered(
  status:
    OutboundMessageStatus
): boolean {
  return (
    status ===
      OutboundMessageStatus.DELIVERED ||
    status ===
      OutboundMessageStatus.READ
  );
}

function isMessageFailure(
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

function isCallReached(
  status:
    CallStatus
): boolean {
  return (
    status ===
      CallStatus.ANSWERED ||
    status ===
      CallStatus.COMPLETED
  );
}

function isCallFailure(
  status:
    CallStatus
): boolean {
  return (
    status ===
      CallStatus.FAILED ||
    status ===
      CallStatus.BUSY ||
    status ===
      CallStatus.NO_ANSWER ||
    status ===
      CallStatus.CANCELED
  );
}

//--------------------------------------------------
// Activity
//--------------------------------------------------

function getMessageActivityDate(
  message:
    RecipientMessageRecord
): Date {
  return (
    message.readAt ??
    message.deliveredAt ??
    message.failedAt ??
    message.sentAt ??
    message.acceptedAt ??
    message.updatedAt ??
    message.createdAt
  );
}

function getCallActivityDate(
  call:
    RecipientCallRecord
): Date {
  return (
    call.completedAt ??
    call.failedAt ??
    call.answeredAt ??
    call.ringingAt ??
    call.queuedAt ??
    call.updatedAt ??
    call.createdAt
  );
}

//--------------------------------------------------
// Channel Aggregate
//--------------------------------------------------

interface MutableAggregate {
  attempts:
    number;

  successful:
    number;

  failed:
    number;
}

function createMutableAggregate():
  MutableAggregate {
  return {
    attempts:
      0,

    successful:
      0,

    failed:
      0,
  };
}

function toChannelMix(
  input: {
    channel:
      CommunicationChannel;

    selected:
      boolean;

    aggregate:
      MutableAggregate;

    averageDurationSeconds:
      number | null;
  }
): CommunicationChannelMixDTO {
  return {
    channel:
      input.channel,

    selected:
      input.selected,

    attempts:
      input
        .aggregate
        .attempts,

    successful:
      input
        .aggregate
        .successful,

    failed:
      input
        .aggregate
        .failed,

    successRate:
      percentage(
        input
          .aggregate
          .successful,
        input
          .aggregate
          .attempts
      ),

    averageDurationSeconds:
      input
        .averageDurationSeconds,
  };
}

//--------------------------------------------------
// Converted Leads
//--------------------------------------------------

async function getConvertedLeadCount(
  campaignIds:
    string[]
): Promise<number> {
  if (
    campaignIds.length ===
    0
  ) {
    return 0;
  }

  const rows =
    await prisma
      .$queryRaw<
        Array<{
          count:
            bigint;
        }>
      >(
        Prisma.sql`
          SELECT
            COUNT(*)::bigint AS "count"
          FROM
            "Lead" AS l
          INNER JOIN
            "Call" AS c
          ON
            c."id" = l."callId"
          WHERE
            c."campaignId" IN (${Prisma.join(
              campaignIds
            )})
          AND
            l."status"::text = 'CONVERTED'
        `
      );

  return Number(
    rows[0]
      ?.count ??
    0
  );
}

//--------------------------------------------------
// Opted-Out Recipients
//--------------------------------------------------

async function getOptedOutRecipientCount(
  campaignId:
    string
): Promise<number> {
  const rows =
    await prisma
      .$queryRaw<
        Array<{
          count:
            bigint;
        }>
      >(
        Prisma.sql`
          SELECT
            COUNT(
              DISTINCT r."phone"
            )::bigint AS "count"
          FROM
            "CommunicationCampaignRecipient" AS r
          INNER JOIN
            "MessageConsent" AS c
          ON
            c."phone" = r."phone"
          WHERE
            r."campaignId" = ${campaignId}
          AND
            c."status"::text = 'OPTED_OUT'
        `
      );

  return Number(
    rows[0]
      ?.count ??
    0
  );
}

//--------------------------------------------------
// Average WhatsApp Time To Read
//--------------------------------------------------

async function getAverageWhatsAppOpenSeconds(
  campaignId:
    string
): Promise<number | null> {
  const rows =
    await prisma
      .$queryRaw<
        Array<{
          averageSeconds:
            number | null;
        }>
      >(
        Prisma.sql`
          SELECT
            (
              AVG(
                EXTRACT(
                  EPOCH FROM (
                    m."readAt" -
                    COALESCE(
                      m."sentAt",
                      m."acceptedAt",
                      m."createdAt"
                    )
                  )
                )
              )
            )::float8 AS "averageSeconds"
          FROM
            "OutboundMessage" AS m
          WHERE
            m."communicationCampaignId" = ${campaignId}
          AND
            m."channel"::text = 'WHATSAPP'
          AND
            m."status"::text = 'READ'
          AND
            m."readAt" IS NOT NULL
        `
      );

  const value =
    rows[0]
      ?.averageSeconds;

  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      Number(
        value
      )
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      Number(
        value
      )
    )
  );
}

//--------------------------------------------------
// Empty Channel
//--------------------------------------------------

function emptyChannel(
  status:
    UnifiedChannelStatus,

  selected:
    boolean
): RecipientChannelInsightDTO {
  return {
    selected,

    status,

    attempts:
      0,

    lastActivityAt:
      null,

    error:
      null,
  };
}

//--------------------------------------------------
// Call Index
//--------------------------------------------------

function buildCallKey(
  campaignId:
    string,

  phone:
    string
): string {
  return [
    campaignId,
    phone,
  ].join(
    "::"
  );
}

//--------------------------------------------------
// Phone Masking
//--------------------------------------------------

function maskPhone(
  phone:
    string
): string {
  const digits =
    phone.replace(
      /\D/g,
      ""
    );

  if (
    digits.length <=
    4
  ) {
    return "••••";
  }

  return `••••••${digits.slice(
    -4
  )}`;
}

//--------------------------------------------------
// Max ISO Date
//--------------------------------------------------

function maxIsoDate(
  values:
    Array<
      string |
      null
    >
): string | null {
  let best:
    Date |
    null =
      null;

  for (
    const value
    of values
  ) {
    if (
      !value
    ) {
      continue;
    }

    const date =
      new Date(
        value
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      continue;
    }

    if (
      !best ||
      date >
        best
    ) {
      best =
        date;
    }
  }

  return best
    ?.toISOString() ??
    null;
}

//--------------------------------------------------
// Percentage
//--------------------------------------------------

function percentage(
  numerator:
    number,

  denominator:
    number
): number {
  if (
    denominator <=
    0
  ) {
    return 0;
  }

  return Math.round(
    (
      numerator /
      denominator
    ) *
      10_000
  ) /
  100;
}

//--------------------------------------------------
// Integer Clamp
//--------------------------------------------------

function clampInteger(
  value:
    number,

  minimum:
    number,

  maximum:
    number
): number {
  const normalized =
    Number.isFinite(
      value
    )
      ? Math.trunc(
          value
        )
      : minimum;

  return Math.max(
    minimum,
    Math.min(
      maximum,
      normalized
    )
  );
}
