import type {
  OutboundCampaignPurpose,
} from "@prisma/client";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface ResolveOutboundWorkflowInput {
  purpose:
    OutboundCampaignPurpose;

  campaignName:
    string;

  description?:
    string | null;

  prompt?:
    string | null;

  contactName?:
    string | null;
}

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface OutboundWorkflow {
  purpose:
    OutboundCampaignPurpose;

  openingMessage:
    string;

  systemInstruction:
    string;
}

//--------------------------------------------------
// Resolve Workflow
//--------------------------------------------------

export function resolveOutboundWorkflow(
  input:
    ResolveOutboundWorkflowInput
): OutboundWorkflow {
  const campaignName =
    normalizeText(
      input.campaignName
    );

  const description =
    normalizeText(
      input.description
    );

  const customPrompt =
    normalizeText(
      input.prompt
    );

  const contactName =
    normalizeText(
      input.contactName
    );

  //------------------------------------------------
  // Opening Message
  //------------------------------------------------

  const openingMessage =
    buildOpeningMessage({
      purpose:
        input.purpose,

      campaignName,

      description,

      contactName,
    });

  //------------------------------------------------
  // Base Instruction
  //------------------------------------------------

  const baseInstruction =
    buildPurposeInstruction(
      input.purpose
    );

  //------------------------------------------------
  // Final AI Instruction
  //------------------------------------------------

  const systemInstruction =
    [
      baseInstruction,

      campaignName
        ? `Campaign name: ${campaignName}.`
        : "",

      description
        ? `Campaign context: ${description}`
        : "",

      customPrompt
        ? `Campaign-specific instruction: ${customPrompt}`
        : "",

      [
        "Keep the conversation concise and natural.",
        "Do not invent account, payment, application, balance, eligibility, or customer-specific facts.",
        "Use approved knowledge and tools when information must be retrieved or an action must be performed.",
        "If the requested action cannot be completed, clearly say so rather than pretending it succeeded.",
      ].join(
        " "
      ),
    ]
      .filter(
        Boolean
      )
      .join(
        "\n\n"
      );

  return {
    purpose:
      input.purpose,

    openingMessage,

    systemInstruction,
  };
}

//--------------------------------------------------
// Purpose Instruction
//--------------------------------------------------

function buildPurposeInstruction(
  purpose:
    OutboundCampaignPurpose
): string {
  switch (
    purpose
  ) {
    case "REMINDER":
      return [
        "This is an outbound reminder call.",
        "Explain the reminder clearly and briefly.",
        "Confirm that the customer understood it.",
        "Do not pressure the customer or claim that a reminder is a legal notice unless the approved campaign context explicitly says so.",
      ].join(
        " "
      );

    case "CALLBACK":
      return [
        "This call is a requested callback.",
        "Acknowledge that the customer requested contact.",
        "Continue with the approved reason for the callback.",
        "Do not claim that a specific action has already been completed unless a tool confirms it.",
      ].join(
        " "
      );

    case "FOLLOW_UP":
      return [
        "This is an outbound follow-up call.",
        "Use the approved campaign context to explain what is being followed up.",
        "Ask only for information necessary to continue the workflow.",
        "Do not invent the status of any previous request or interaction.",
      ].join(
        " "
      );

    case "GENERAL":
    default:
      return [
        "This is a general outbound customer conversation.",
        "Follow the approved campaign context and answer relevant questions.",
        "Do not introduce unrelated offers, claims, or actions.",
      ].join(
        " "
      );
  }
}

//--------------------------------------------------
// Opening Message
//--------------------------------------------------

function buildOpeningMessage(
  input: {
    purpose:
      OutboundCampaignPurpose;

    campaignName:
      string;

    description:
      string;

    contactName:
      string;
  }
): string {
  const greeting =
    input.contactName
      ? `Hello ${input.contactName}.`
      : "Hello.";

  if (
    input.description
  ) {
    return `${greeting} ${input.description}`;
  }

  switch (
    input.purpose
  ) {
    case "REMINDER":
      return `${greeting} This is a reminder call.`;

    case "CALLBACK":
      return `${greeting} I am calling back regarding your request.`;

    case "FOLLOW_UP":
      return `${greeting} I am following up with you.`;

    case "GENERAL":
    default:
      return input.campaignName
        ? `${greeting} I am calling regarding ${input.campaignName}.`
        : `${greeting} I am calling regarding your enquiry.`;
  }
}

//--------------------------------------------------
// Normalize
//--------------------------------------------------

function normalizeText(
  value:
    string |
    null |
    undefined
): string {
  return value
    ?.trim()
    .replace(
      /\s+/g,
      " "
    ) ??
    "";
}