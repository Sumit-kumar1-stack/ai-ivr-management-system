import {
  CallStatus,
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  mapProviderStatus,
} from "@/providers/telephony/status-map";


interface CreateCallData {
  campaignId: string;

  campaignRunId?: string;

  contactId: string;

  contactPhoneSnapshot: string;

  providerDestination: string;

  usedDevelopmentOverride: boolean;

  destinationOverrideSource?: string;

  language: string;
}


export interface CreateCallResult {
  call: Awaited<
    ReturnType<
      typeof prisma.call.create
    >
  >;

  created: boolean;
}


//--------------------------------------------------
// Create Idempotent Internal Call
//--------------------------------------------------

export async function createCall(
  data: CreateCallData
): Promise<CreateCallResult> {

  try {

    const call =
      await prisma.call.create({
        data: {
          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,

          contactId:
            data.contactId,

          contactPhoneSnapshot:
            data.contactPhoneSnapshot,

          providerDestination:
            data.providerDestination,

          usedDevelopmentOverride:
            data.usedDevelopmentOverride,

          destinationOverrideSource:
            data.destinationOverrideSource,

          language:
            data.language,

          /*
           * requestedAt defaults to now().
           *
           * This represents the moment our
           * application requested the call.
           */
          status:
            CallStatus.QUEUED,
        },
      });


    return {
      call,

      created:
        true,
    };

  } catch (error) {

    //----------------------------------------
    // Campaign Contact Idempotency
    //----------------------------------------

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002" &&
      data.campaignRunId
    ) {

      const existingCall =
        await prisma.call.findUnique({
          where: {
            campaignRunId_contactId: {
              campaignRunId:
                data.campaignRunId,

              contactId:
                data.contactId,
            },
          },
        });


      if (
        existingCall
      ) {

        return {
          call:
            existingCall,

          created:
            false,
        };

      }

    }


    throw error;

  }

}


//--------------------------------------------------
// Update Call
//--------------------------------------------------

export async function updateCall(
  id: string,
  data: {
    providerCallId?: string;

    status?: CallStatus;

    duration?: number;

    recordingUrl?: string;

    transcript?: string;

    summary?: string;

    requestedAt?: Date;

    queuedAt?: Date;

    ringingAt?: Date;

    answeredAt?: Date;

    completedAt?: Date;

    failedAt?: Date;
  }
) {

  return prisma.call.update({
    where: {
      id,
    },

    data,
  });

}


//--------------------------------------------------
// Get By Provider Call ID
//--------------------------------------------------

export async function getCallByProviderId(
  providerCallId: string
) {

  return prisma.call.findFirst({
    where: {
      providerCallId,
    },
  });

}


//--------------------------------------------------
// Get Internal Call
//--------------------------------------------------

export async function getCall(
  id: string
) {

  return prisma.call.findUnique({
    where: {
      id,
    },

    include: {
      campaign:
        true,

      campaignRun:
        true,

      contact:
        true,
    },
  });

}


//--------------------------------------------------
// Handle Verified Provider Status Callback
//--------------------------------------------------

export async function updateCallStatus(
  data: {
    providerCallId: string;

    status: string;

    duration?: number;
  }
) {

  const mappedStatus =
    mapProviderStatus(
      data.status
    );


  const now =
    new Date();


  const timestampData:
    Prisma.CallUpdateManyMutationInput = {};


  //----------------------------------------
  // Provider Lifecycle Timestamp Mapping
  //----------------------------------------

  switch (
    mappedStatus
  ) {

    case CallStatus.QUEUED:

      timestampData.queuedAt =
        now;

      break;


    case CallStatus.RINGING:

      timestampData.ringingAt =
        now;

      break;


    case CallStatus.ANSWERED:

      timestampData.answeredAt =
        now;

      /*
       * Temporary compatibility with code
       * still reading startedAt.
       */
      timestampData.startedAt =
        now;

      break;


    case CallStatus.COMPLETED:

      timestampData.completedAt =
        now;

      /*
       * Temporary compatibility with code
       * still reading endedAt.
       */
      timestampData.endedAt =
        now;

      break;


    case CallStatus.FAILED:
    case CallStatus.BUSY:
    case CallStatus.NO_ANSWER:
    case CallStatus.CANCELED:

      timestampData.failedAt =
        now;

      timestampData.completedAt =
        now;

      timestampData.endedAt =
        now;

      break;

  }


  //----------------------------------------
  // Avoid Overwriting First Occurrence Times
  //----------------------------------------

  const existingCall =
    await prisma.call.findFirst({
      where: {
        providerCallId:
          data.providerCallId,
      },

      select: {
        id:
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
      },
    });


  if (
    !existingCall
  ) {

    return {
      count:
        0,
    };

  }


  const updateData:
    Prisma.CallUpdateInput = {
      status:
        mappedStatus,

      duration:
        data.duration,
  };


  if (
    timestampData.queuedAt &&
    !existingCall.queuedAt
  ) {
    updateData.queuedAt =
      timestampData.queuedAt;
  }


  if (
    timestampData.ringingAt &&
    !existingCall.ringingAt
  ) {
    updateData.ringingAt =
      timestampData.ringingAt;
  }


  if (
    timestampData.answeredAt &&
    !existingCall.answeredAt
  ) {
    updateData.answeredAt =
      timestampData.answeredAt;

    updateData.startedAt =
      timestampData.startedAt;
  }


  if (
    timestampData.completedAt &&
    !existingCall.completedAt
  ) {
    updateData.completedAt =
      timestampData.completedAt;

    updateData.endedAt =
      timestampData.endedAt;
  }


  if (
    timestampData.failedAt &&
    !existingCall.failedAt
  ) {
    updateData.failedAt =
      timestampData.failedAt;
  }


  await prisma.call.update({
    where: {
      id:
        existingCall.id,
    },

    data:
      updateData,
  });


  return {
    count:
      1,
  };

}