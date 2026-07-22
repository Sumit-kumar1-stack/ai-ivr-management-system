import {
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

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

    code?: string | number;
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

  results: CampaignContactResult[];
}


//--------------------------------------------------
// Run Campaign
//--------------------------------------------------

export async function runCampaign(
  campaignId: string,
  campaignRunId: string
): Promise<RunCampaignResult> {

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
      CampaignRunStatus.FAILED
  ) {

    console.warn(
      "Campaign run already finished",
      {
        campaignId,

        campaignRunId,

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
      }
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

  const startedAt =
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

        startedAt,

        total:
          campaign.contacts.length,
      },
    });


  /*
   * updateMany prevents two workers from claiming
   * the same campaign run at the same time.
   */
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


    console.warn(
      "Campaign run could not be claimed",
      {
        campaignId,

        campaignRunId,

        currentStatus:
          currentRun.status,
      }
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

      /*
       * Preserve the first campaign start time.
       */
      startedAt:
        campaign.startedAt ??
        startedAt,

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
    CampaignContactResult[] = [];


  let processed =
    0;


  let successful =
    0;


  let failed =
    0;


  console.log(
    "Campaign processing started",
    {
      campaignId,

      campaignRunId,

      total,

      developmentOverrideEnabled,
    }
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
    const item of campaign.contacts
  ) {

    const contact =
      item.contact;


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

          /*
           * Original contact phone snapshot.
           */
          contactPhone,

          /*
           * Actual number submitted to provider.
           */
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


      console.log(
        "Campaign contact processed successfully",
        {
          campaignId,

          campaignRunId,

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
        }
      );

    } catch (error) {

      failed +=
        1;


      const normalizedError =
        normalizeError(
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


      console.error(
        "Campaign contact processing failed",
        {
          campaignId,

          campaignRunId,

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

          error:
            normalizedError,
        }
      );


      /*
       * Do not throw here.
       *
       * One contact failure must not stop
       * remaining campaign contacts.
       */

    } finally {

      processed +=
        1;


      //--------------------------------------------
      // Persist Progress After Each Contact
      //--------------------------------------------

      await updateCampaignRunProgressSafely({
        campaignRunId,

        total,

        processed,

        successful,

        failed,
      });

    }

  }


  //------------------------------------------------
  // Resolve Final Status
  //------------------------------------------------

  const completedAt =
    new Date();


  /*
   * All contacts failed:
   * campaign run is FAILED.
   *
   * At least one call succeeded:
   * campaign run is COMPLETED, even when some
   * individual contacts failed.
   */
  const finalRunStatus =
    successful === 0 &&
    failed > 0
      ? CampaignRunStatus.FAILED
      : CampaignRunStatus.COMPLETED;


  const finalCampaignStatus =
    finalRunStatus ===
    CampaignRunStatus.FAILED
      ? CampaignStatus.FAILED
      : CampaignStatus.COMPLETED;


  //------------------------------------------------
  // Persist Final Campaign State
  //------------------------------------------------

  await prisma.$transaction([
    prisma.campaignRun.update({
      where: {
        id:
          campaignRunId,
      },

      data: {
        status:
          finalRunStatus,

        total,

        processed,

        successful,

        failed,

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
          finalCampaignStatus,

        completedAt,
      },
    }),
  ]);


  console.log(
    "Campaign processing completed",
    {
      campaignId,

      campaignRunId,

      total,

      processed,

      successful,

      failed,

      finalRunStatus,

      finalCampaignStatus,

      completedAt,
    }
  );


  return {
    campaignId,

    campaignRunId,

    total,

    processed,

    successful,

    failed,

    status:
      finalRunStatus,

    results,
  };

}


//--------------------------------------------------
// Safely Persist Campaign Progress
//--------------------------------------------------

async function updateCampaignRunProgressSafely(
  input: {
    campaignRunId: string;

    total: number;

    processed: number;

    successful: number;

    failed: number;
  }
): Promise<void> {

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

  } catch (error) {

    /*
     * Progress persistence failure is logged,
     * but it does not stop the next contact.
     *
     * The final transaction will attempt to
     * store the authoritative final counters.
     */
    console.error(
      "Failed to persist campaign progress",
      {
        campaignRunId:
          input.campaignRunId,

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
      }
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
    process.env[name]
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
// Normalize Unknown Errors
//--------------------------------------------------

function normalizeError(
  error: unknown
): {
  name: string;

  message: string;

  code?: string | number;
} {

  if (
    error instanceof
    Error
  ) {

    const errorWithCode =
      error as Error & {
        code?:
          string |
          number;
      };


    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,
    };

  }


  if (
    typeof error ===
    "string"
  ) {

    return {
      name:
        "Error",

      message:
        error,
    };

  }


  try {

    return {
      name:
        "UnknownError",

      message:
        JSON.stringify(
          error
        ),
    };

  } catch {

    return {
      name:
        "UnknownError",

      message:
        String(
          error
        ),
    };

  }

}


//--------------------------------------------------
// Mask Phone Number For Logs
//--------------------------------------------------

function maskPhoneNumber(
  phone: string
): string {

  if (
    !phone
  ) {

    return "unknown";

  }


  if (
    phone.length <=
    4
  ) {

    return "****";

  }


  const visibleDigits =
    phone.slice(
      -4
    );


  const maskedLength =
    Math.max(
      phone.length -
      4,
      4
    );


  return `${"*".repeat(
    maskedLength
  )}${visibleDigits}`;

}