import {
  CallStatus,
  CommunicationChannel,
  LeadStatus,
  MessagingChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import type {
  CommunicationCampaignDetailsDTO,
  CommunicationChannelRuntimeStatus,
  CommunicationInsightStatus,
  CommunicationMessagingChannelMetrics,
  CommunicationRecipientChannelState,
  CommunicationRecipientInsightDTO,
  CommunicationVoiceChannelMetrics,
} from "@/types/communication-campaign-details";

//--------------------------------------------------
// Options
//--------------------------------------------------

export interface CommunicationCampaignDetailsOptions {
  page?:
    number;

  pageSize?:
    number;
}

//--------------------------------------------------
// SQL Result Shapes
//--------------------------------------------------

interface CountRow {
  value:
    bigint |
    number;
}

interface AverageRow {
  value:
    number |
    null;
}

//--------------------------------------------------
// Main Read Model
//--------------------------------------------------

export async function getCommunicationCampaignDetails(
  communicationCampaignId:
    string,

  options: CommunicationCampaignDetailsOptions =
    {}
): Promise<CommunicationCampaignDetailsDTO> {
  const id =
    communicationCampaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const page =
    normalizePage(
      options.page
    );

  const pageSize =
    normalizePageSize(
      options.pageSize
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

          name:
            true,

          status:
            true,

          tier:
            true,

          channels:
            true,

          fallbackPolicy:
            true,

          audienceSourceName:
            true,

          recipientCount:
            true,

          voiceCampaignId:
            true,

          ivrCampaignId:
            true,

          createdAt:
            true,

          updatedAt:
            true,

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
    totalRecipients ===
    0
      ? 1
      : Math.ceil(
          totalRecipients /
          pageSize
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
            createdAt:
              "asc",
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

          lastError:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },
      });

  //------------------------------------------------
  // Campaign-Level Analytics
  //------------------------------------------------

  const [
    messageGroups,
    callGroups,
    voiceDuration,
    ivrDuration,
    convertedCount,
    unsubscribedCount,
    averageOpen,
  ] =
    await Promise.all([
      prisma
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
            _all:
              true,
          },
        }),

      getCallGroups(
        campaign
          .voiceCampaignId,
        campaign
          .ivrCampaignId
      ),

      getAverageCallDuration(
        campaign
          .voiceCampaignId
      ),

      getAverageCallDuration(
        campaign
          .ivrCampaignId
      ),

      getConvertedRecipientCount(
        campaign
          .voiceCampaignId,
        campaign
          .ivrCampaignId
      ),

      getCurrentOptedOutRecipientCount(
        campaign.id,
        campaign.channels
      ),

      getAverageWhatsAppOpenMinutes(
        campaign.id
      ),
    ]);

  const smsMetrics =
    buildMessagingMetrics(
      MessagingChannel.SMS,
      messageGroups
    );

  const whatsappMetrics =
    buildMessagingMetrics(
      MessagingChannel.WHATSAPP,
      messageGroups
    );

  const aiVoiceMetrics =
    buildVoiceMetrics(
      campaign.voiceCampaignId,
      callGroups,
      voiceDuration
    );

  const ivrMetrics =
    buildVoiceMetrics(
      campaign.ivrCampaignId,
      callGroups,
      ivrDuration
    );

  //------------------------------------------------
  // Page-Level Unified Recipient Status
  //------------------------------------------------

  const recipientInsights =
    await buildRecipientInsights({
      campaignId:
        campaign.id,

      channels:
        campaign.channels,

      fallbackPolicy:
        campaign.fallbackPolicy,

      voiceCampaignId:
        campaign
          .voiceCampaignId,

      ivrCampaignId:
        campaign
          .ivrCampaignId,

      recipients,
    });

  //------------------------------------------------
  // Funnel
  //------------------------------------------------

  const sent =
    smsMetrics.dispatched +
    whatsappMetrics.dispatched +
    aiVoiceMetrics.dispatched +
    ivrMetrics.dispatched;

  const delivered =
    smsMetrics.delivered +
    whatsappMetrics.delivered +
    aiVoiceMetrics.answered +
    ivrMetrics.answered;

  const opened =
    whatsappMetrics.read;

  const dropped =
    smsMetrics.failed +
    whatsappMetrics.failed +
    aiVoiceMetrics.failed +
    ivrMetrics.failed;

  const bounced =
    countMessageGroups(
      messageGroups,
      [
        MessagingChannel.SMS,
        MessagingChannel.WHATSAPP,
      ],
      [
        OutboundMessageStatus.UNDELIVERED,
      ]
    );

  return {
    campaign: {
      id:
        campaign.id,

      name:
        campaign.name,

      status:
        campaign.status,

      tier:
        campaign.tier,

      channels:
        campaign.channels,

      fallbackPolicy:
        campaign
          .fallbackPolicy,

      audienceSourceName:
        campaign
          .audienceSourceName,

      recipientCount:
        totalRecipients,

      voiceCampaignId:
        campaign
          .voiceCampaignId,

      ivrCampaignId:
        campaign
          .ivrCampaignId,

      createdAt:
        campaign
          .createdAt
          .toISOString(),

      updatedAt:
        campaign
          .updatedAt
          .toISOString(),
    },

    funnel: {
      sent,

      delivered,

      opened,

      converted:
        convertedCount,
    },

    secondaryMetrics: {
      dropped,

      bounced,

      unsubscribed:
        unsubscribedCount,

      averageTimeToOpenMinutes:
        averageOpen,
    },

    channelMix: {
      SMS:
        smsMetrics,

      WHATSAPP:
        whatsappMetrics,

      AI_VOICE:
        aiVoiceMetrics,

      IVR:
        ivrMetrics,
    },

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

    generatedAt:
      new Date()
        .toISOString(),
  };
}

//--------------------------------------------------
// Recipient Read Model
//--------------------------------------------------

async function buildRecipientInsights(
  input: {
    campaignId:
      string;

    channels:
      CommunicationChannel[];

    fallbackPolicy:
      string;

    voiceCampaignId:
      string | null;

    ivrCampaignId:
      string | null;

    recipients:
      Array<{
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

        lastError:
          string | null;

        createdAt:
          Date;

        updatedAt:
          Date;
      }>;
  }
): Promise<
  CommunicationRecipientInsightDTO[]
> {
  if (
    input
      .recipients
      .length ===
    0
  ) {
    return [];
  }

  const recipientIds =
    input
      .recipients
      .map(
        recipient =>
          recipient.id
      );

  const phones =
    input
      .recipients
      .map(
        recipient =>
          recipient.phone
      );

  const childCampaignIds =
    [
      input
        .voiceCampaignId,
      input
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

  //------------------------------------------------
  // Messages
  //------------------------------------------------

  const messages =
    await prisma
      .outboundMessage
      .findMany({
        where: {
          communicationCampaignId:
            input.campaignId,

          communicationRecipientId: {
            in:
              recipientIds,
          },
        },

        orderBy: {
          updatedAt:
            "desc",
        },

        select: {
          id:
            true,

          communicationRecipientId:
            true,

          channel:
            true,

          status:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },
      });

  //------------------------------------------------
  // Contacts + Calls
  //------------------------------------------------

  const contacts =
    childCampaignIds.length >
    0
      ? await prisma
          .contact
          .findMany({
            where: {
              phone: {
                in:
                  phones,
              },
            },

            select: {
              id:
                true,

              phone:
                true,
            },
          })
      : [];

  const contactIds =
    contacts.map(
      contact =>
        contact.id
    );

  const calls =
    childCampaignIds.length >
      0 &&
    contactIds.length >
      0
      ? await prisma
          .call
          .findMany({
            where: {
              campaignId: {
                in:
                  childCampaignIds,
              },

              contactId: {
                in:
                  contactIds,
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

              contactId:
                true,

              status:
                true,

              attemptNumber:
                true,

              requestedAt:
                true,

              updatedAt:
                true,
            },
          })
      : [];

  //------------------------------------------------
  // Converted Calls
  //------------------------------------------------

  const callIds =
    calls.map(
      call =>
        call.id
    );

  const convertedLeads =
    callIds.length >
    0
      ? await prisma
          .lead
          .findMany({
            where: {
              callId: {
                in:
                  callIds,
              },

              status:
                LeadStatus.CONVERTED,
            },

            select: {
              callId:
                true,
            },
          })
      : [];

  const convertedCallIds =
    new Set(
      convertedLeads.map(
        lead =>
          lead.callId
      )
    );

  //------------------------------------------------
  // Indexes
  //------------------------------------------------

  const messageByRecipientChannel =
    new Map<
      string,
      typeof messages[number]
    >();

  for (
    const message
    of messages
  ) {
    if (
      !message
        .communicationRecipientId
    ) {
      continue;
    }

    const key =
      `${message.communicationRecipientId}:${message.channel}`;

    if (
      !messageByRecipientChannel
        .has(
          key
        )
    ) {
      messageByRecipientChannel
        .set(
          key,
          message
        );
    }
  }

  const phoneByContactId =
    new Map(
      contacts.map(
        contact => [
          contact.id,
          contact.phone,
        ] as const
      )
    );

  const callByPhoneCampaign =
    new Map<
      string,
      typeof calls[number]
    >();

  const callsByPhone =
    new Map<
      string,
      typeof calls
    >();

  for (
    const call
    of calls
  ) {
    const phone =
      phoneByContactId
        .get(
          call.contactId
        );

    if (
      !phone
    ) {
      continue;
    }

    const key =
      `${phone}:${call.campaignId}`;

    if (
      !callByPhoneCampaign
        .has(
          key
        )
    ) {
      callByPhoneCampaign
        .set(
          key,
          call
        );
    }

    const existing =
      callsByPhone
        .get(
          phone
        ) ??
      [];

    existing.push(
      call
    );

    callsByPhone
      .set(
        phone,
        existing
      );
  }

  //------------------------------------------------
  // DTOs
  //------------------------------------------------

  return input
    .recipients
    .map(
      recipient => {
        const sms =
          messageByRecipientChannel
            .get(
              `${recipient.id}:${MessagingChannel.SMS}`
            );

        const whatsapp =
          messageByRecipientChannel
            .get(
              `${recipient.id}:${MessagingChannel.WHATSAPP}`
            );

        const voiceCall =
          input
            .voiceCampaignId
            ? callByPhoneCampaign
                .get(
                  `${recipient.phone}:${input.voiceCampaignId}`
                )
            : undefined;

        const ivrCall =
          input
            .ivrCampaignId
            ? callByPhoneCampaign
                .get(
                  `${recipient.phone}:${input.ivrCampaignId}`
                )
            : undefined;

        const channelStates = {
          SMS:
            buildMessageState(
              input.channels.includes(
                CommunicationChannel.SMS
              ),
              sms
            ),

          WHATSAPP:
            buildMessageState(
              input.channels.includes(
                CommunicationChannel.WHATSAPP
              ),
              whatsapp
            ),

          AI_VOICE:
            buildCallState(
              input.channels.includes(
                CommunicationChannel.AI_VOICE
              ),
              voiceCall
            ),

          IVR:
            buildCallState(
              input.channels.includes(
                CommunicationChannel.IVR
              ),
              ivrCall
            ),
        };

        const recipientCalls =
          callsByPhone
            .get(
              recipient.phone
            ) ??
          [];

        const converted =
          recipientCalls.some(
            call =>
              convertedCallIds
                .has(
                  call.id
                )
          );

        const status =
          deriveOverallRecipientStatus(
            channelStates,
            converted,
            input
              .fallbackPolicy
          );

        const lastActivityAt =
          latestDate([
            recipient
              .updatedAt,

            sms
              ?.updatedAt,

            whatsapp
              ?.updatedAt,

            voiceCall
              ?.updatedAt,

            ivrCall
              ?.updatedAt,
          ]);

        return {
          id:
            recipient.id,

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

          status,

          converted,

          lastError:
            recipient
              .lastError,

          lastActivityAt:
            lastActivityAt
              .toISOString(),

          channels:
            channelStates,
        };
      }
    );
}

//--------------------------------------------------
// Message State
//--------------------------------------------------

function buildMessageState(
  selected:
    boolean,

  message:
    | {
        status:
          OutboundMessageStatus;

        createdAt:
          Date;

        updatedAt:
          Date;
      }
    | undefined
): CommunicationRecipientChannelState {
  if (
    !selected
  ) {
    return notSelectedState();
  }

  if (
    !message
  ) {
    return pendingState();
  }

  return {
    selected:
      true,

    status:
      message
        .status as
        CommunicationChannelRuntimeStatus,

    attemptedAt:
      message
        .createdAt
        .toISOString(),

    updatedAt:
      message
        .updatedAt
        .toISOString(),
  };
}

//--------------------------------------------------
// Call State
//--------------------------------------------------

function buildCallState(
  selected:
    boolean,

  call:
    | {
        status:
          CallStatus;

        requestedAt:
          Date;

        updatedAt:
          Date;
      }
    | undefined
): CommunicationRecipientChannelState {
  if (
    !selected
  ) {
    return notSelectedState();
  }

  if (
    !call
  ) {
    return pendingState();
  }

  return {
    selected:
      true,

    status:
      call
        .status as
        CommunicationChannelRuntimeStatus,

    attemptedAt:
      call
        .requestedAt
        .toISOString(),

    updatedAt:
      call
        .updatedAt
        .toISOString(),
  };
}

//--------------------------------------------------
// Overall Recipient Status
//--------------------------------------------------

function deriveOverallRecipientStatus(
  channels: {
    SMS:
      CommunicationRecipientChannelState;

    WHATSAPP:
      CommunicationRecipientChannelState;

    AI_VOICE:
      CommunicationRecipientChannelState;

    IVR:
      CommunicationRecipientChannelState;
  },

  converted:
    boolean,

  fallbackPolicy:
    string
): CommunicationInsightStatus {
  //------------------------------------------------
  // Conversion Wins
  //------------------------------------------------

  if (
    converted
  ) {
    return "CONVERTED";
  }

  //------------------------------------------------
  // Logical Channel States
  //
  // WhatsApp -> SMS fallback must be treated as
  // ONE logical messaging path.
  //
  // Example:
  //
  // WhatsApp FAILED
  //       ↓
  // SMS DELIVERED
  //
  // This is a successful fallback, not PARTIAL.
  //------------------------------------------------

  const statuses:
    CommunicationChannelRuntimeStatus[] =
      [];

  const whatsapp =
    channels
      .WHATSAPP;

  const sms =
    channels
      .SMS;

  const whatsappToSmsFallback =
    fallbackPolicy ===
      "WHATSAPP_TO_SMS" &&
    whatsapp.selected &&
    sms.selected;

  //------------------------------------------------
  // Messaging Path
  //------------------------------------------------

  if (
    whatsappToSmsFallback
  ) {
    //------------------------------------------------
    // WhatsApp Failed
    //
    // SMS now represents the logical messaging path.
    //------------------------------------------------

    if (
      isFailureStatus(
        whatsapp.status
      )
    ) {
      statuses.push(
        sms.status
      );
    } else {
      //------------------------------------------------
      // WhatsApp Is Pending / Active / Successful
      //
      // SMS is intentionally deferred and therefore
      // must NOT make the recipient look unfinished.
      //------------------------------------------------

      statuses.push(
        whatsapp.status
      );
    }
  } else {
    //------------------------------------------------
    // Normal Independent Channels
    //------------------------------------------------

    if (
      whatsapp.selected
    ) {
      statuses.push(
        whatsapp.status
      );
    }

    if (
      sms.selected
    ) {
      statuses.push(
        sms.status
      );
    }
  }

  //------------------------------------------------
  // AI Voice
  //------------------------------------------------

  if (
    channels
      .AI_VOICE
      .selected
  ) {
    statuses.push(
      channels
        .AI_VOICE
        .status
    );
  }

  //------------------------------------------------
  // Classic IVR
  //------------------------------------------------

  if (
    channels
      .IVR
      .selected
  ) {
    statuses.push(
      channels
        .IVR
        .status
    );
  }

  //------------------------------------------------
  // Nothing Selected / Nothing Available
  //------------------------------------------------

  if (
    statuses.length ===
    0
  ) {
    return "PENDING";
  }

  //------------------------------------------------
  // Work Still Running
  //------------------------------------------------

  if (
    statuses.some(
      status =>
        status ===
          "PENDING" ||
        isActiveStatus(
          status
        )
    )
  ) {
    return "IN_PROGRESS";
  }

  //------------------------------------------------
  // Terminal Outcomes
  //------------------------------------------------

  const successes =
    statuses.filter(
      status =>
        isSuccessStatus(
          status
        )
    ).length;

  const failures =
    statuses.filter(
      status =>
        isFailureStatus(
          status
        )
    ).length;

  //------------------------------------------------
  // Some Channels Succeeded,
  // Some Failed
  //------------------------------------------------

  if (
    successes >
      0 &&
    failures >
      0
  ) {
    return "PARTIAL";
  }

  //------------------------------------------------
  // At Least One Successful Logical Path
  //------------------------------------------------

  if (
    successes >
    0
  ) {
    return "COMPLETED";
  }

  //------------------------------------------------
  // All Terminal Paths Failed
  //------------------------------------------------

  if (
    failures >
    0
  ) {
    return "FAILED";
  }

  return "PENDING";
}

//--------------------------------------------------
// Status Classification
//--------------------------------------------------

function isActiveStatus(
  status:
    CommunicationChannelRuntimeStatus
): boolean {
  return (
    status ===
      "PROCESSING" ||
    status ===
      "ACCEPTED" ||
    status ===
      "QUEUED" ||
    status ===
      "SENT" ||
    status ===
      "RINGING" ||
    status ===
      "ANSWERED"
  );
}

function isSuccessStatus(
  status:
    CommunicationChannelRuntimeStatus
): boolean {
  return (
    status ===
      "DELIVERED" ||
    status ===
      "READ" ||
    status ===
      "COMPLETED"
  );
}

function isFailureStatus(
  status:
    CommunicationChannelRuntimeStatus
): boolean {
  return (
    status ===
      "FAILED" ||
    status ===
      "UNDELIVERED" ||
    status ===
      "BUSY" ||
    status ===
      "NO_ANSWER" ||
    status ===
      "CANCELED"
  );
}

//--------------------------------------------------
// State Helpers
//--------------------------------------------------

function pendingState():
  CommunicationRecipientChannelState {
  return {
    selected:
      true,

    status:
      "PENDING",

    attemptedAt:
      null,

    updatedAt:
      null,
  };
}

function notSelectedState():
  CommunicationRecipientChannelState {
  return {
    selected:
      false,

    status:
      "NOT_SELECTED",

    attemptedAt:
      null,

    updatedAt:
      null,
  };
}

//--------------------------------------------------
// Messaging Metrics
//--------------------------------------------------

function buildMessagingMetrics(
  channel:
    MessagingChannel,

  groups:
    Array<{
      channel:
        MessagingChannel;

      status:
        OutboundMessageStatus;

      _count: {
        _all:
          number;
      };
    }>
): CommunicationMessagingChannelMetrics {
  const attempted =
    countMessageGroups(
      groups,
      [
        channel,
      ],
      Object.values(
        OutboundMessageStatus
      )
    );

  const dispatched =
    countMessageGroups(
      groups,
      [
        channel,
      ],
      [
        OutboundMessageStatus.ACCEPTED,
        OutboundMessageStatus.QUEUED,
        OutboundMessageStatus.SENT,
        OutboundMessageStatus.DELIVERED,
        OutboundMessageStatus.READ,
      ]
    );

  const delivered =
    countMessageGroups(
      groups,
      [
        channel,
      ],
      [
        OutboundMessageStatus.DELIVERED,
        OutboundMessageStatus.READ,
      ]
    );

  const read =
    countMessageGroups(
      groups,
      [
        channel,
      ],
      [
        OutboundMessageStatus.READ,
      ]
    );

  const failed =
    countMessageGroups(
      groups,
      [
        channel,
      ],
      [
        OutboundMessageStatus.FAILED,
        OutboundMessageStatus.UNDELIVERED,
      ]
    );

  return {
    attempted,

    dispatched,

    delivered,

    read,

    failed,

    deliveryRate:
      percentage(
        delivered,
        attempted
      ),
  };
}

//--------------------------------------------------
// Voice Metrics
//--------------------------------------------------

function buildVoiceMetrics(
  campaignId:
    string | null,

  groups:
    Array<{
      campaignId:
        string;

      status:
        CallStatus;

      _count: {
        _all:
          number;
      };
    }>,

  averageDurationSeconds:
    number | null
): CommunicationVoiceChannelMetrics {
  if (
    !campaignId
  ) {
    return {
      attempted:
        0,

      dispatched:
        0,

      answered:
        0,

      completed:
        0,

      failed:
        0,

      answerRate:
        0,

      averageDurationSeconds:
        null,
    };
  }

  const groupCount =
    (
      statuses:
        CallStatus[]
    ) =>
      groups
        .filter(
          group =>
            group.campaignId ===
              campaignId &&
            statuses.includes(
              group.status
            )
        )
        .reduce(
          (
            total,
            group
          ) =>
            total +
            group
              ._count
              ._all,
          0
        );

  const attempted =
    groups
      .filter(
        group =>
          group.campaignId ===
          campaignId
      )
      .reduce(
        (
          total,
          group
        ) =>
          total +
          group
            ._count
            ._all,
        0
      );

  const dispatched =
    groupCount([
      CallStatus.RINGING,
      CallStatus.ANSWERED,
      CallStatus.COMPLETED,
      CallStatus.FAILED,
      CallStatus.BUSY,
      CallStatus.NO_ANSWER,
      CallStatus.CANCELED,
    ]);

  const answered =
    groupCount([
      CallStatus.ANSWERED,
      CallStatus.COMPLETED,
    ]);

  const completed =
    groupCount([
      CallStatus.COMPLETED,
    ]);

  const failed =
    groupCount([
      CallStatus.FAILED,
      CallStatus.BUSY,
      CallStatus.NO_ANSWER,
      CallStatus.CANCELED,
    ]);

  return {
    attempted,

    dispatched,

    answered,

    completed,

    failed,

    answerRate:
      percentage(
        answered,
        attempted
      ),

    averageDurationSeconds,
  };
}

//--------------------------------------------------
// Message Group Count
//--------------------------------------------------

function countMessageGroups(
  groups:
    Array<{
      channel:
        MessagingChannel;

      status:
        OutboundMessageStatus;

      _count: {
        _all:
          number;
      };
    }>,

  channels:
    MessagingChannel[],

  statuses:
    OutboundMessageStatus[]
): number {
  return groups
    .filter(
      group =>
        channels.includes(
          group.channel
        ) &&
        statuses.includes(
          group.status
        )
    )
    .reduce(
      (
        total,
        group
      ) =>
        total +
        group
          ._count
          ._all,
      0
    );
}

//--------------------------------------------------
// Call Groups
//--------------------------------------------------

async function getCallGroups(
  voiceCampaignId:
    string | null,

  ivrCampaignId:
    string | null
) {
  const campaignIds =
    [
      voiceCampaignId,
      ivrCampaignId,
    ]
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      );

  if (
    campaignIds.length ===
    0
  ) {
    return [];
  }

  return prisma
    .call
    .groupBy({
      by: [
        "campaignId",
        "status",
      ],

      where: {
        campaignId: {
          in:
            campaignIds,
        },
      },

      _count: {
        _all:
          true,
      },
    });
}

//--------------------------------------------------
// Average Call Duration
//--------------------------------------------------

async function getAverageCallDuration(
  campaignId:
    string | null
): Promise<
  number | null
> {
  if (
    !campaignId
  ) {
    return null;
  }

  const result =
    await prisma
      .call
      .aggregate({
        where: {
          campaignId,

          duration: {
            not:
              null,
          },
        },

        _avg: {
          duration:
            true,
        },
      });

  return result
    ._avg
    .duration ??
    null;
}

//--------------------------------------------------
// Converted Recipients
//--------------------------------------------------

async function getConvertedRecipientCount(
  voiceCampaignId:
    string | null,

  ivrCampaignId:
    string | null
): Promise<number> {
  const campaignIds =
    [
      voiceCampaignId,
      ivrCampaignId,
    ]
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      );

  if (
    campaignIds.length ===
    0
  ) {
    return 0;
  }

  const campaignFilter =
    Prisma.sql`
      c."campaignId" IN (
        ${Prisma.join(
          campaignIds
        )}
      )
    `;

  const rows =
    await prisma
      .$queryRaw<
        CountRow[]
      >(
        Prisma.sql`
          SELECT
            COUNT(
              DISTINCT c."contactId"
            )::int AS "value"
          FROM "Call" c
          INNER JOIN "Lead" l
            ON l."callId" = c."id"
          WHERE
            ${campaignFilter}
            AND l."status"::text =
              ${LeadStatus.CONVERTED}
        `
      );

  return numberFromCount(
    rows[0]
      ?.value
  );
}

//--------------------------------------------------
// Current Opt-Out Count
//--------------------------------------------------

async function getCurrentOptedOutRecipientCount(
  communicationCampaignId:
    string,

  channels:
    CommunicationChannel[]
): Promise<number> {
  const messagingChannels:
    string[] =
      [];

  if (
    channels.includes(
      CommunicationChannel.SMS
    )
  ) {
    messagingChannels.push(
      MessagingChannel.SMS
    );
  }

  if (
    channels.includes(
      CommunicationChannel.WHATSAPP
    )
  ) {
    messagingChannels.push(
      MessagingChannel.WHATSAPP
    );
  }

  if (
    messagingChannels.length ===
    0
  ) {
    return 0;
  }

  const rows =
    await prisma
      .$queryRaw<
        CountRow[]
      >(
        Prisma.sql`
          SELECT
            COUNT(
              DISTINCT mc."phone"
            )::int AS "value"
          FROM "MessageConsent" mc
          INNER JOIN
            "CommunicationCampaignRecipient" cr
            ON cr."phone" = mc."phone"
          WHERE
            cr."campaignId" =
              ${communicationCampaignId}
            AND mc."status"::text =
              'OPTED_OUT'
            AND mc."channel"::text IN (
              ${Prisma.join(
                messagingChannels
              )}
            )
        `
      );

  return numberFromCount(
    rows[0]
      ?.value
  );
}

//--------------------------------------------------
// Average WhatsApp Open Time
//--------------------------------------------------

async function getAverageWhatsAppOpenMinutes(
  communicationCampaignId:
    string
): Promise<
  number | null
> {
  const rows =
    await prisma
      .$queryRaw<
        AverageRow[]
      >(
        Prisma.sql`
          SELECT
            AVG(
              GREATEST(
                0,
                EXTRACT(
                  EPOCH FROM (
                    "readAt" -
                    COALESCE(
                      "acceptedAt",
                      "createdAt"
                    )
                  )
                ) / 60.0
              )
            )::double precision
              AS "value"
          FROM "OutboundMessage"
          WHERE
            "communicationCampaignId" =
              ${communicationCampaignId}
            AND "channel"::text =
              'WHATSAPP'
            AND "readAt" IS NOT NULL
        `
      );

  const value =
    rows[0]
      ?.value;

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

  return Math.round(
    Number(
      value
    ) *
    10
  ) /
  10;
}

//--------------------------------------------------
// General Helpers
//--------------------------------------------------

function normalizePage(
  value:
    number |
    undefined
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value
    )
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(
      value ??
      1
    )
  );
}

function normalizePageSize(
  value:
    number |
    undefined
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value
    )
  ) {
    return 25;
  }

  return Math.max(
    10,
    Math.min(
      100,
      Math.floor(
        value ??
        25
      )
    )
  );
}

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

function numberFromCount(
  value:
    bigint |
    number |
    undefined
): number {
  if (
    value ===
    undefined
  ) {
    return 0;
  }

  return Number(
    value
  );
}

function latestDate(
  values:
    Array<
      Date |
      null |
      undefined
    >
): Date {
  const valid =
    values.filter(
      (
        value
      ): value is Date =>
        value instanceof
        Date
    );

  if (
    valid.length ===
    0
  ) {
    return new Date(
      0
    );
  }

  return new Date(
    Math.max(
      ...valid.map(
        value =>
          value.getTime()
      )
    )
  );
}