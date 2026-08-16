import {
  CallDirection,
  type OutboundCampaignPurpose,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  resolveOutboundWorkflow,
} from "@/services/campaigns/outbound-workflow.service";

//--------------------------------------------------
// Context Type
//--------------------------------------------------

export interface OutboundConversationContext {
  outbound:
    boolean;

  purpose:
    OutboundCampaignPurpose | null;

  campaignId:
    string | null;

  campaignName:
    string | null;

  instruction:
    string | null;

  openingMessage:
    string | null;
}

//--------------------------------------------------
// Empty Context
//--------------------------------------------------

const EMPTY_CONTEXT:
  OutboundConversationContext = {
    outbound:
      false,

    purpose:
      null,

    campaignId:
      null,

    campaignName:
      null,

    instruction:
      null,

    openingMessage:
      null,
  };

//--------------------------------------------------
// Resolve Outbound Conversation Context
//--------------------------------------------------

export async function resolveOutboundConversationContext(
  callId:
    string
): Promise<OutboundConversationContext> {
  const normalizedCallId =
    callId.trim();

  //----------------------------------------------
  // Invalid ID
  //----------------------------------------------

  if (
    !normalizedCallId
  ) {
    return {
      ...EMPTY_CONTEXT,
    };
  }

  //----------------------------------------------
  // Load Call And Campaign
  //----------------------------------------------

  const call =
    await prisma.call.findUnique({
      where: {
        id:
          normalizedCallId,
      },

      select: {
        id:
          true,

        direction:
          true,

        campaignId:
          true,

        contact: {
          select: {
            fullName:
              true,
          },
        },

        campaign: {
          select: {
            id:
              true,

            name:
              true,

            description:
              true,

            prompt:
              true,

            purpose:
              true,
          },
        },
      },
    });

  //----------------------------------------------
  // Call Missing
  //----------------------------------------------

  if (
    !call
  ) {
    return {
      ...EMPTY_CONTEXT,
    };
  }

  //----------------------------------------------
  // Inbound Calls Do Not Use Campaign Workflow
  //----------------------------------------------

  if (
    call.direction !==
    CallDirection.OUTBOUND
  ) {
    return {
      ...EMPTY_CONTEXT,
    };
  }

  //----------------------------------------------
  // Campaign Missing
  //----------------------------------------------

  if (
    !call.campaign
  ) {
    return {
      ...EMPTY_CONTEXT,

      outbound:
        true,
    };
  }

  //----------------------------------------------
  // Build Provider-Neutral Workflow
  //----------------------------------------------

  const workflow =
    resolveOutboundWorkflow({
      purpose:
        call.campaign.purpose,

      campaignName:
        call.campaign.name,

      description:
        call.campaign.description,

      prompt:
        call.campaign.prompt,

      contactName:
        call.contact
          ?.fullName,
    });

  //----------------------------------------------
  // Return Context
  //----------------------------------------------

  return {
    outbound:
      true,

    purpose:
      workflow.purpose,

    campaignId:
      call.campaign.id,

    campaignName:
      call.campaign.name,

    instruction:
      workflow.systemInstruction,

    openingMessage:
      workflow.openingMessage,
  };
}

//--------------------------------------------------
// Build Prompt Section
//--------------------------------------------------

export function buildOutboundContextPrompt(
  context:
    OutboundConversationContext
): string {
  if (
    !context.outbound ||
    !context.instruction
  ) {
    return "";
  }

  const purpose =
    context.purpose ??
    "GENERAL";

  return [
    "Outbound Call Context",
    `Purpose: ${purpose}`,
    context.campaignName
      ? `Campaign: ${context.campaignName}`
      : "",
    context.instruction,
    [
      "Maintain this workflow context throughout the call.",
      "Do not change the purpose of the conversation because the caller asks a follow-up question.",
      "Answer relevant follow-up questions naturally.",
      "Never claim that a business action succeeded unless an approved tool or system result confirms it.",
    ].join(
      " "
    ),
  ]
    .filter(
      Boolean
    )
    .join(
      "\n"
    );
}