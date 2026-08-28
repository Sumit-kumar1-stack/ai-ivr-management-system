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

  const openingMessage =
    buildOpeningMessage({
      purpose:
        input.purpose,

      campaignName,

      description,

      contactName,
    });

  const baseInstruction =
    buildPurposeInstruction(
      input.purpose
    );

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
        "If an action cannot be completed, clearly say so instead of pretending that it succeeded.",
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
        "Explain the approved reminder clearly and briefly.",
        "Confirm that the customer understood it.",
        "Do not invent reminder details.",
      ].join(
        " "
      );

    case "CALLBACK":
      return [
        "This is a requested callback.",
        "Acknowledge that the customer requested contact.",
        "Continue with the approved reason for the callback.",
        "Do not claim that an action was completed unless a tool confirms it.",
      ].join(
        " "
      );

    case "FOLLOW_UP":
      return [
        "This is an outbound follow-up call.",
        "Explain what is being followed up using only approved campaign context.",
        "Do not invent the status of an earlier request or interaction.",
      ].join(
        " "
      );

    case "GENERAL":
    default:
      return [
        "This is a general outbound customer conversation.",
        "Follow the approved campaign context.",
        "Do not introduce unrelated claims, offers, or actions.",
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
// Normalize Text
//--------------------------------------------------

function normalizeText(
  value:
    | string
    | null
    | undefined
): string {
  return value
    ?.trim()
    .replace(
      /\s+/g,
      " "
    ) ??
    "";
}