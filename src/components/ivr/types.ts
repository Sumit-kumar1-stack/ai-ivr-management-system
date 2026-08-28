import type {
  Edge,
  Node,
} from "@xyflow/react";

//--------------------------------------------------
// Knowledge
//--------------------------------------------------

export interface KnowledgeFile {
  id: string;

  name: string;

  type: string;

  size: number;
}

//--------------------------------------------------
// Node Kinds
//--------------------------------------------------

export type IVRNodeKind =
  | "START"
  | "GREETING"
  | "AI"
  | "AI_CONVERSATION"
  | "ACTION"
  | "CONDITION"
  | "DTMF_MENU"
  | "HYBRID_MENU"
  | "KNOWLEDGE"
  | "TRANSFER"
  | "HUMAN_TRANSFER"
  | "CALLBACK"
  | "SEND_INFORMATION"
  | "BUSINESS_HOURS"
  | "AUTH_GATE"
  | "END_CALL";

//--------------------------------------------------
// Transition Triggers
//--------------------------------------------------

export type IVRTransitionTrigger =
  | "DEFAULT"
  | "DTMF"
  | "VOICE_INTENT"
  | "ACTION_SUCCESS"
  | "ACTION_FAILURE"
  | "TIMEOUT"
  | "HUMAN_TRANSFER"
  | "KNOWLEDGE_FOUND"
  | "NO_RELEVANT_KNOWLEDGE"
  | "UNAVAILABLE"
  | "AUTHENTICATED"
  | "NOT_AUTHENTICATED"
  | "AVAILABLE"
  | "OUTSIDE_HOURS";

//--------------------------------------------------
// Runtime Actions
//--------------------------------------------------

export type IVRRuntimeAction =
  | "LOAN_INFORMATION"
  | "DEPOSIT_INFORMATION"
  | "BRANCH_INFORMATION"
  | "REQUEST_CALLBACK"
  | "HUMAN_AGENT"
  | "AGENT_REQUEST"
  | "REPEAT_MENU"
  | "CONTINUE_AI"
  | "END_CALL"
  | "CUSTOM";

//--------------------------------------------------
// DTMF Option
//--------------------------------------------------

export interface IVRRuntimeMenuOption {
  digit: string;

  action: IVRRuntimeAction;

  label: string;

  response?: string;

  value?: string;

  destinationNodeId?: string;

  /** Explicit staged-entry context; destinationNodeId remains the graph source of truth. */
  intent?: string;
  department?: string;
  language?: "English" | "Hindi" | "Hinglish" | "AUTO";

  voicePhrases?: string[];
}

//--------------------------------------------------
// DTMF Runtime Menu
//--------------------------------------------------

export interface IVRRuntimeMenuConfig {
  type:
    "DTMF_MENU";

  prompt:
    string;

  invalidPrompt:
    string;

  timeoutPrompt:
    string;

  exhaustedPrompt:
    string;

  maxAttempts:
    number;

  timeoutSeconds?: number;

  options:
    IVRRuntimeMenuOption[];
}

export type IVRRuntimeMenuSettings =
  Omit<IVRRuntimeMenuConfig, "options"> & {
    // Historical flows nested options under runtimeMenu.  New drafts keep
    // them in IVRNodeData.options; this optional field is read only.
    options?: IVRRuntimeMenuOption[];
  };

//--------------------------------------------------
// Edge Data
//--------------------------------------------------

export interface IVREdgeData
  extends Record<
    string,
    unknown
  > {
  trigger?:
    IVRTransitionTrigger;

  value?:
    string;

  label?:
    string;
}

//--------------------------------------------------
// Node Data
//--------------------------------------------------

export interface IVRNodeData
  extends Record<
    string,
    unknown
  > {
  nodeKind?:
    IVRNodeKind;

  label?: string;

  description?: string;

  prompt?: string;

  greeting?: string;

  instruction?: string;

  question?: string;

  //------------------------------------------------
  // AI
  //------------------------------------------------

  temperature?: number;

  topP?: number;

  maxTokens?: number;

  presencePenalty?: number;

  frequencyPenalty?: number;

  provider?: string;

  voice?: string;

  language?: string;

  speed?: number;

  pitch?: number;

  actionCode?: string;

  conditionExpression?:
    string;

  knowledge?:
    KnowledgeFile[];

  knowledgeDocumentIds?:
    string[];

  knowledgeIds?:
    string[];

  transferDestinationId?:
    string;

  destinationId?:
    string;

  humanTransferDestinationId?:
    string;

  /** Phase-B canonical transfer fields. transferDestinationId stays for legacy runtime compatibility. */
  destinationRef?: string;
  destinationType?: "PHONE" | "SIP" | "USER";
  department?: string;
  businessHoursPolicy?: string;
  callbackEnabled?: boolean;
  confirmationPrompt?: string;
  enabled?: boolean;
  preferredTimeCapture?: boolean;
  timezonePolicy?: string;

  callbackConfigId?:
    string;

  callbackDestinationId?:
    string;

  sendInformationTemplateId?:
    string;

  businessHoursPolicyId?:
    string;

  requiredAuthLevel?:
    string;

  minimumAuthLevel?:
    string;

  authLevel?:
    string;

  authenticationLevel?:
    string;

  allowNaturalLanguageEscape?:
    boolean;

  escapeNodeId?:
    string;

  fallbackNodeId?:
    string;

  nextNodeId?:
    string;

  defaultAiNodeId?: string;

  retryPrompt?:
    string;

  maxAttempts?:
    number;

  /** Provider-aware entry experience for new IVR drafts. */
  inputExperience?: "VOICE" | "KEYPAD" | "STAGED_HYBRID";

  /**
   * Entry-only voice runtime selection for the START node.
   * AUTO defers the final runtime to deterministic call-entry policy.
   */
  runtimeMode?: "STANDARD" | "PREMIUM" | "AUTO";

  /** Optional supported fallback used when runtimeMode is AUTO. */
  runtimeDefault?: "STANDARD" | "PREMIUM";

  //------------------------------------------------
  // Runtime DTMF
  //------------------------------------------------

  options?:
    IVRRuntimeMenuOption[];

  runtimeMenu?:
    IVRRuntimeMenuSettings;
}

//--------------------------------------------------
// React Flow Types
//--------------------------------------------------

export type IVRNode =
  Node<IVRNodeData>;

export type IVREdge =
  Edge<IVREdgeData>;

//--------------------------------------------------
// Stored Flow
//--------------------------------------------------

export interface IVRFlow {
  id: string;

  name: string;

  description?:
    string | null;

  campaignId?:
    string | null;

  nodes:
    IVRNode[];

  edges:
    IVREdge[];

  isPublished:
    boolean;

  version:
    number;

  createdAt:
    string;

  updatedAt:
    string;

  versions?:
    IVRFlowVersionSummary[];
}

export interface IVRFlowVersionSummary {
  id: string;
  flowId: string;
  tenantId: string | null;
  versionNumber: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
}
