import type { CommunicationCampaignDTO } from "@/types/communication-campaign";

export type CampaignReadinessState =
  | "READY"
  | "WARNING"
  | "MISSING"
  | "OPTIONAL";

export interface CampaignReadinessItem {
  key: string;
  label: string;
  state: CampaignReadinessState;
  detail: string;
}

export interface KnowledgeDocumentSummary {
  id: string;
  status: "ACTIVE" | "ARCHIVED";
  chunkCount: number;
  isIndexed: boolean;
  campaignCount: number;
}

export interface CampaignReadinessInput {
  campaign: Pick<
    CommunicationCampaignDTO,
    | "recipientCount"
    | "channels"
    | "approvalStatus"
    | "approvalRequired"
    | "launchImmediately"
    | "scheduledAt"
    | "ivrFlowId"
  >;
  campaignDescription: string;
  campaignPrompt: string;
  selectedKnowledgeDocumentIds: string[];
  knowledgeDocuments: KnowledgeDocumentSummary[];
  campaignActionsLength: number;
}

export function formatCampaignKnowledgeUsageCount(
  campaignCount: number
): string {
  return `${campaignCount} other campaign${campaignCount === 1 ? "" : "s"}`;
}

export function getCampaignActionEmptyStateCopy(): {
  title: string;
  description: string;
  examples: string[];
} {
  return {
    title: "No campaign actions configured yet.",
    description:
      "Actions define what the system may do after the AI resolves a customer intent, such as creating a lead, requesting a callback, or routing a human-assistance request.",
    examples: [
      "CREATE_LEAD",
      "REQUEST_CALLBACK",
      "REQUEST_HUMAN",
    ],
  };
}

function buildKnowledgeWarnings(
  selectedKnowledgeDocuments: KnowledgeDocumentSummary[]
): string[] {
  const warnings: string[] = [];

  if (
    selectedKnowledgeDocuments.some(
      document => document.status === "ARCHIVED"
    )
  ) {
    warnings.push("Archived knowledge remains attached for this draft.");
  }

  if (
    selectedKnowledgeDocuments.some(
      document => !document.isIndexed || document.chunkCount === 0
    )
  ) {
    warnings.push("One or more selected documents are still indexing.");
  }

  return warnings;
}

export function buildCampaignReadinessItems(
  input: CampaignReadinessInput
): CampaignReadinessItem[] {
  const selectedKnowledgeDocuments =
    input.knowledgeDocuments.filter(document =>
      input.selectedKnowledgeDocumentIds.includes(document.id)
    );

  const knowledgeWarnings =
    buildKnowledgeWarnings(selectedKnowledgeDocuments);

  const hasAudience = input.campaign.recipientCount > 0;
  const hasObjective = Boolean(input.campaignDescription.trim());
  const hasOpeningMessage = Boolean(input.campaignPrompt.trim());
  const hasKnowledge = input.selectedKnowledgeDocumentIds.length > 0;
  const approvalReady =
    !input.campaign.approvalRequired ||
    input.campaign.approvalStatus === "APPROVED";
  const scheduleReady =
    input.campaign.launchImmediately ||
    Boolean(input.campaign.scheduledAt);
  const ivrReady =
    !input.campaign.channels.includes("IVR") ||
    Boolean(input.campaign.ivrFlowId);

  const items: CampaignReadinessItem[] = [
    {
      key: "audience",
      label: "Audience",
      state: hasAudience ? "READY" : "MISSING",
      detail: hasAudience
        ? `${input.campaign.recipientCount} recipient${input.campaign.recipientCount === 1 ? "" : "s"} selected`
        : "No audience has been saved yet.",
    },
    {
      key: "knowledge",
      label: "Knowledge",
      state: hasKnowledge
        ? knowledgeWarnings.length > 0
          ? "WARNING"
          : "READY"
        : input.campaign.channels.includes("AI_VOICE")
          ? "WARNING"
          : "OPTIONAL",
      detail: hasKnowledge
        ? knowledgeWarnings[0] ?? "Approved documents are attached."
        : input.campaign.channels.includes("AI_VOICE")
          ? "Attach approved knowledge for AI Voice answers."
          : "Not required for the current channel mix.",
    },
    {
      key: "ai_voice",
      label: "AI Voice",
      state: input.campaign.channels.includes("AI_VOICE")
        ? "READY"
        : "OPTIONAL",
      detail: input.campaign.channels.includes("AI_VOICE")
        ? "AI Voice is enabled for this campaign."
        : "AI Voice is not selected.",
    },
    {
      key: "actions",
      label: "Actions",
      state: input.campaignActionsLength > 0 ? "READY" : "OPTIONAL",
      detail:
        input.campaignActionsLength > 0
          ? `${input.campaignActionsLength} configured campaign action${input.campaignActionsLength === 1 ? "" : "s"}`
          : getCampaignActionEmptyStateCopy().description,
    },
    {
      key: "approval",
      label: "Approval",
      state: approvalReady ? "READY" : "MISSING",
      detail: approvalReady
        ? input.campaign.approvalRequired
          ? "Campaign is approved for launch."
          : "Approval is not required for this campaign."
        : "Campaign is pending review.",
    },
    {
      key: "schedule",
      label: "Schedule",
      state: scheduleReady ? "READY" : "MISSING",
      detail: scheduleReady
        ? input.campaign.launchImmediately
          ? "Launch immediately is enabled."
          : "A future execution time is saved."
        : "Schedule the campaign before launch.",
    },
    {
      key: "ivr",
      label: "IVR",
      state: ivrReady ? "READY" : "MISSING",
      detail: ivrReady
        ? "IVR flow is configured."
        : "Select and save a published IVR flow before launch.",
    },
  ];

  if (input.campaign.channels.includes("AI_VOICE")) {
    items.splice(3, 0, {
      key: "objective",
      label: "Objective",
      state: hasObjective ? "READY" : "MISSING",
      detail: hasObjective
        ? "Campaign objective is saved."
        : "Campaign objective is required for AI Voice campaigns.",
    });

    items.splice(4, 0, {
      key: "opening",
      label: "Opening Message",
      state: hasOpeningMessage ? "READY" : "MISSING",
      detail: hasOpeningMessage
        ? "Opening message/instructions are saved."
        : "Opening message/instructions are required for AI Voice campaigns.",
    });
  }

  return items;
}

export function getCampaignLaunchBlockers(
  input: CampaignReadinessInput
): string[] {
  const blockers: string[] = [];

  if (input.campaign.recipientCount === 0) {
    blockers.push("No audience has been saved yet.");
  }

  if (input.campaign.channels.length === 0) {
    blockers.push("No campaign channels are selected.");
  }

  if (
    input.campaign.approvalRequired &&
    input.campaign.approvalStatus !== "APPROVED"
  ) {
    blockers.push("Campaign approval is pending.");
  }

  if (
    input.campaign.channels.includes("AI_VOICE") &&
    !input.campaignDescription.trim()
  ) {
    blockers.push("Campaign objective is required for AI Voice campaigns.");
  }

  if (
    input.campaign.channels.includes("AI_VOICE") &&
    !input.campaignPrompt.trim()
  ) {
    blockers.push(
      "Opening message/instructions are required for AI Voice campaigns."
    );
  }

  if (
    input.campaign.channels.includes("IVR") &&
    !input.campaign.ivrFlowId
  ) {
    blockers.push(
      "Select and save a published IVR flow before launching this campaign."
    );
  }

  if (
    !input.campaign.launchImmediately &&
    !input.campaign.scheduledAt
  ) {
    blockers.push("Scheduled execution time is missing.");
  }

  const selectedKnowledgeDocuments =
    input.knowledgeDocuments.filter(document =>
      input.selectedKnowledgeDocumentIds.includes(document.id)
    );

  if (
    selectedKnowledgeDocuments.some(
      document => document.status === "ARCHIVED"
    )
  ) {
    blockers.push("Selected knowledge includes archived documents.");
  }

  if (
    selectedKnowledgeDocuments.some(
      document => !document.isIndexed || document.chunkCount === 0
    )
  ) {
    blockers.push("Selected knowledge is still indexing.");
  }

  return blockers;
}

export function getCampaignReviewStateLabel(
  approvalStatus: CommunicationCampaignDTO["approvalStatus"]
): string {
  switch (approvalStatus) {
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "SUBMITTED":
      return "Pending approval";
    case "DRAFT":
    default:
      return "Draft";
  }
}
