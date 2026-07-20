import {
  prisma,
} from "@/lib/prisma";

import {
  startCall,
} from "@/services/telephony/telephony.service";


export async function runCampaign(
  campaignId: string
) {

  //--------------------------------------------------
  // Load Campaign and Assigned Contacts
  //--------------------------------------------------

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
      "Campaign not found"
    );

  }


  //--------------------------------------------------
  // Campaign Execution Results
  //--------------------------------------------------

  const results: Array<
    Record<string, unknown>
  > = [];


  //--------------------------------------------------
  // Call Each Campaign Contact
  //--------------------------------------------------

  for (
    const item of campaign.contacts
  ) {

    const contact =
      item.contact;


    //------------------------------------------------
    // Validate Contact Phone Number
    //------------------------------------------------

    if (
      !contact.phone?.trim()
    ) {

      console.warn(
        "Campaign call skipped: contact phone number is missing",
        {
          campaignId:
            campaign.id,

          contactId:
            contact.id,

          contactName:
            contact.fullName,
        }
      );


      results.push({
        contactId:
          contact.id,

        status:
          "FAILED",

        reason:
          "Contact phone number is missing",
      });


      continue;

    }


    //------------------------------------------------
    // Select Destination Number
    //------------------------------------------------

    const testDestination =
      process.env
        .TEST_DESTINATION_NUMBER
        ?.trim();


    const isDevelopmentOverride =
      process.env.NODE_ENV ===
        "development" &&
      Boolean(
        testDestination
      );


    const destination =
      isDevelopmentOverride
        ? testDestination!
        : contact.phone.trim();


    //------------------------------------------------
    // Prominently Log Development Override
    //------------------------------------------------

    if (
      isDevelopmentOverride
    ) {

      console.warn(
        "⚠️ DEVELOPMENT PHONE OVERRIDE ACTIVE",
        {
          campaignId:
            campaign.id,

          contactId:
            contact.id,

          originalDestination:
            contact.phone,

          overriddenDestination:
            destination,

          environment:
            process.env.NODE_ENV,
        }
      );

    }


    //------------------------------------------------
    // Log Outbound Call Attempt
    //------------------------------------------------

    console.info(
      "Starting campaign call",
      {
        campaignId:
          campaign.id,

        contactId:
          contact.id,

        contactName:
          contact.fullName,

        destination,

        language:
          contact.language ??
          "en",

        usingTestDestination:
          isDevelopmentOverride,
      }
    );


    try {

      //------------------------------------------------
      // Start Outbound Call
      //------------------------------------------------

      const result =
        await startCall({

          campaignId:
            campaign.id,

          contactId:
            contact.id,

          to:
            destination,

          from:
            process.env
              .TWILIO_PHONE_NUMBER!,

          language:
            contact.language ??
            "en",

          script:
            campaign.prompt ??
            "Hello from AI IVR.",

        });


      //------------------------------------------------
      // Store Successful Result
      //------------------------------------------------

      results.push({
        contactId:
          contact.id,

        destination,

        status:
          "STARTED",

        result,
      });


      console.info(
        "Campaign call started successfully",
        {
          campaignId:
            campaign.id,

          contactId:
            contact.id,

          destination,

          result,
        }
      );

    }

    catch (error) {

      //------------------------------------------------
      // Continue Campaign After Individual Failure
      //------------------------------------------------

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(
              error
            );


      console.error(
        "Campaign call failed",
        {
          campaignId:
            campaign.id,

          contactId:
            contact.id,

          destination,

          error:
            errorMessage,
        }
      );


      results.push({
        contactId:
          contact.id,

        destination,

        status:
          "FAILED",

        reason:
          errorMessage,
      });

    }

  }


  //--------------------------------------------------
  // Return Campaign Execution Summary
  //--------------------------------------------------

  const successful =
    results.filter(
      result =>
        result.status ===
        "STARTED"
    ).length;


  const failed =
    results.filter(
      result =>
        result.status ===
        "FAILED"
    ).length;


  return {
    campaignId:
      campaign.id,

    total:
      results.length,

    successful,

    failed,

    testDestinationOverride:
      process.env.NODE_ENV ===
        "development" &&
      Boolean(
        process.env
          .TEST_DESTINATION_NUMBER
          ?.trim()
      ),

    results,
  };

}