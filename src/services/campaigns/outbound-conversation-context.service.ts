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
// Context Types
//--------------------------------------------------

export interface ConversationPartyContext {
  name:
    string | null;

  reference:
    string | null;

  language:
    string | null;
}

export interface ConversationCampaignContext {
  id:
    string | null;

  name:
    string | null;

  objective:
    string | null;

  audience:
    string | null;

  description:
    string | null;

  instruction:
    string | null;

  runtime:
    string | null;
}

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

  campaign:
    ConversationCampaignContext;

  customer:
    ConversationPartyContext;

  callLanguage:
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

    campaign: {
      id:
        null,

      name:
        null,

      objective:
        null,

      audience:
        null,

      description:
        null,

      instruction:
        null,

      runtime:
        null,
    },

    customer: {
      name:
        null,

      reference:
        null,

      language:
        null,
    },

    callLanguage:
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

  if (
    !normalizedCallId
  ) {
    return {
      ...EMPTY_CONTEXT,
    };
  }

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

        language:
          true,

        campaignId:
          true,

        communicationCampaignId:
          true,

        contact: {
          select: {
            id:
              true,

            fullName:
              true,

            phone:
              true,

            language:
              true,
          },
        },

        communicationOutboundAttempt: {
          select: {
            campaignRecipient: {
              select: {
                externalRecipientId:
                  true,

                fullName:
                  true,

                phone:
                  true,

                language:
                  true,
              },
            },
          },
        },

        communicationCampaign: {
          select: {
            id:
              true,

            name:
              true,

            description:
              true,

            prompt:
              true,

            audienceSourceName:
              true,

            tier:
              true,

            channels:
              true,

            knowledgeDocumentIds:
              true,

            ownerUserId:
              true,

            ownerUser: {
              select: {
                tenantId:
                  true,
              },
            },
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

            communicationVoiceParent: {
              select: {
                id:
                  true,

                name:
                  true,

                description:
                  true,

                prompt:
                  true,

                audienceSourceName:
                  true,

                tier:
                  true,

                channels:
                  true,
              },
            },
          },
        },
      },
    });

  if (
    !call ||
    call.direction !==
      CallDirection.OUTBOUND
  ) {
    return {
      ...EMPTY_CONTEXT,
    };
  }

  if (
    !call.campaign &&
    !call.communicationCampaign
  ) {
    return {
      ...EMPTY_CONTEXT,

      outbound:
        true,
    };
  }

  const communicationCampaign =
    call.communicationCampaign ??
    call.campaign?.communicationVoiceParent ??
    null;

  const communicationRecipient =
    call.communicationOutboundAttempt?.campaignRecipient ??
    (communicationCampaign && call.contact?.phone
      ? await prisma.communicationCampaignRecipient.findFirst(
          {
            where: {
              campaignId:
                communicationCampaign.id,

              phone:
                call.contact.phone,
            },

            select: {
              externalRecipientId:
                true,

              fullName:
                true,

              language:
                true,
            },
          }
        )
      : null);

  const customerName =
    sanitizeTemplateValue(
      communicationRecipient?.fullName ??
        call.contact?.fullName
    );

  const customerReference =
    sanitizeTemplateValue(
      communicationRecipient?.externalRecipientId
    );

  const customerLanguage =
    sanitizeTemplateValue(
      communicationRecipient?.language ??
        call.contact?.language ??
        call.language
    );

  const templateValues =
    buildTemplateValues({
      campaignName:
        sanitizeTemplateValue(
          communicationCampaign?.name ??
            call.campaign?.name ??
            null
        ),

      campaignObjective:
        sanitizeTemplateValue(
          communicationCampaign?.audienceSourceName ??
            (call.campaign
              ? String(call.campaign.purpose)
              : null)
        ),

      campaignAudience:
        sanitizeTemplateValue(
          communicationCampaign?.audienceSourceName ??
            null
        ),

      campaignDescription:
        sanitizeTemplateValue(
          communicationCampaign?.description ??
            call.campaign?.description ??
            null
        ),

      campaignInstruction:
        sanitizeTemplateValue(
          communicationCampaign?.prompt ??
            call.campaign?.prompt ??
            null
        ),

      customerName,

      customerReference,

      customerLanguage,

      callLanguage:
        sanitizeTemplateValue(
          call.language
        ),
    });

  const workflow =
    communicationCampaign
      ? {
          purpose:
            null as OutboundCampaignPurpose | null,

          openingMessage:
            renderConversationTemplate(
              buildCommunicationOpeningMessage(
                customerName
              ),
              templateValues
            ),

          systemInstruction:
            renderConversationTemplate(
              buildCommunicationSystemInstruction(
                {
                  campaignName:
                    communicationCampaign.name,

                  audienceSourceName:
                    communicationCampaign.audienceSourceName,

                  tier:
                    String(
                      communicationCampaign.tier
                    ),

                  channels:
                    (communicationCampaign.channels ?? []).map(
                      channel =>
                        String(
                          channel
                        )
                    ),

                  description:
                    communicationCampaign.description,

                  prompt:
                    communicationCampaign.prompt,
                }
              ),
              templateValues
            ),
        }
      : (() => {
          const resolved =
            resolveOutboundWorkflow({
              purpose:
                call.campaign!.purpose,

              campaignName:
                call.campaign!.name,

              description:
                call.campaign!.description,

              prompt:
                call.campaign!.prompt,

              contactName:
                customerName ??
                call.contact
                  ?.fullName ??
                undefined,
            });

          return {
            purpose:
              resolved.purpose,

            openingMessage:
              renderConversationTemplate(
                resolved.openingMessage,
                templateValues
              ),

            systemInstruction:
              renderConversationTemplate(
                resolved.systemInstruction,
                templateValues
              ),
          };
        })();

  return {
    outbound:
      true,

    purpose:
      workflow.purpose,

    campaignId:
      communicationCampaign?.id ??
      call.campaign?.id ??
      null,

    campaignName:
      communicationCampaign?.name ??
      call.campaign?.name ??
      null,

    instruction:
      workflow.systemInstruction,

    openingMessage:
      workflow.openingMessage,

    campaign: {
      id:
        communicationCampaign?.id ??
        call.campaign?.id ??
        null,

      name:
        communicationCampaign?.name ??
        call.campaign?.name ??
        null,

      objective:
        communicationCampaign?.audienceSourceName ??
        (call.campaign
          ? String(call.campaign.purpose)
          : null),

      audience:
        communicationCampaign?.audienceSourceName ??
        null,

      description:
        communicationCampaign
          ? sanitizeTemplateValue(
              communicationCampaign.description
            )
          : sanitizeTemplateValue(
              call.campaign?.description
            ),

      instruction:
        communicationCampaign
          ? sanitizeTemplateValue(
              communicationCampaign.prompt
            )
          : sanitizeTemplateValue(
              call.campaign?.prompt
            ),

      runtime:
        communicationCampaign
          ? String(
              communicationCampaign.tier
            )
          : null,
    },

    customer: {
      name:
        customerName,

      reference:
        customerReference,

      language:
        customerLanguage,
    },

    callLanguage:
      sanitizeTemplateValue(
        call.language
      ),
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
    context.campaign.name
      ? `Campaign: ${context.campaign.name}`
      : "",
    context.campaign.objective
      ? `Objective: ${context.campaign.objective}`
      : "",
    context.campaign.audience
      ? `Audience: ${context.campaign.audience}`
      : "",
    context.customer.name
      ? `Customer: ${context.customer.name}`
      : "",
    context.customer.reference
      ? `Customer Reference: ${context.customer.reference}`
      : "",
    context.customer.language
      ? `Customer Language: ${context.customer.language}`
      : "",
    context.callLanguage
      ? `Call Language: ${context.callLanguage}`
      : "",
    `Purpose: ${purpose}`,
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

//--------------------------------------------------
// Communication Greeting
//--------------------------------------------------

function buildCommunicationOpeningMessage(
  customerName:
    string | null
): string {
  return customerName
    ? "Hello {{customer.name}}."
    : "Hello. How may I help you today?";
}

//--------------------------------------------------
// Communication Instruction
//--------------------------------------------------

function buildCommunicationSystemInstruction(
  input: {
    campaignName:
      string | null;

    audienceSourceName:
      string | null;

    tier:
      string;

    channels:
      string[];

    description?:
      string | null;

    prompt?:
      string | null;
  }
): string {
  return [
    "This is an outbound communication campaign.",
    input.campaignName
      ? `Campaign name: ${input.campaignName}.`
      : "",
    input.audienceSourceName
      ? `Audience source: ${input.audienceSourceName}.`
      : "",
    `Campaign tier: ${input.tier}.`,
    input.channels.length > 0
      ? `Enabled channels: ${input.channels.join(", ")}.`
      : "",
    input.description
      ? `Campaign description: ${input.description}.`
      : "",
    input.prompt
      ? `Campaign instructions: ${input.prompt}.`
      : "",
    "Use only the approved campaign context and customer snapshot below.",
    "Do not invent customer-specific facts.",
    "If a required value is missing, ask for clarification instead of guessing.",
  ]
    .filter(
      Boolean
    )
    .join(
      " "
    );
}

//--------------------------------------------------
// Template Rendering
//--------------------------------------------------

function renderConversationTemplate(
  template: string,
  values: Record<string, string>
): string {
  return normalizeTemplateText(
    template.replace(
      /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}/g,
      (
        _match,
        key: string
      ) =>
        values[
          key
        ] ?? ""
    )
  );
}

function buildTemplateValues(
  input: {
    campaignName:
      string | null;

    campaignObjective:
      string | null;

    campaignAudience:
      string | null;

    campaignDescription:
      string | null;

    campaignInstruction:
      string | null;

    customerName:
      string | null;

    customerReference:
      string | null;

    customerLanguage:
      string | null;

    callLanguage:
      string | null;
  }
): Record<string, string> {
  return {
    "campaign.name":
      input.campaignName ?? "",

    "campaign.objective":
      input.campaignObjective ?? "",

    "campaign.audience":
      input.campaignAudience ?? "",

    "campaign.description":
      input.campaignDescription ?? "",

    "campaign.instruction":
      input.campaignInstruction ?? "",

    "customer.name":
      input.customerName ?? "",

    "customer.reference":
      input.customerReference ?? "",

    "customer.language":
      input.customerLanguage ?? "",

    "call.language":
      input.callLanguage ?? "",
  };
}

function sanitizeTemplateValue(
  value:
    string | null | undefined
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .trim();

  return normalized
    ? normalized
    : null;
}

function normalizeTemplateText(
  value:
    string
): string {
  return value
    .replace(
      /[\r\n\t]+/g,
      " "
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .trim();
}
