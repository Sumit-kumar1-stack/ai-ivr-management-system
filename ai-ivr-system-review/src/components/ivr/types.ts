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
  | "ACTION"
  | "CONDITION"
  | "DTMF_MENU"
  | "TRANSFER"
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
  | "HUMAN_TRANSFER";

//--------------------------------------------------
// Runtime Actions
//--------------------------------------------------

export type IVRRuntimeAction =
  | "LOAN_INFORMATION"
  | "DEPOSIT_INFORMATION"
  | "BRANCH_INFORMATION"
  | "REQUEST_CALLBACK"
  | "HUMAN_AGENT"
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

  options:
    IVRRuntimeMenuOption[];
}

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

  //------------------------------------------------
  // Runtime DTMF
  //------------------------------------------------

  runtimeMenu?:
    IVRRuntimeMenuConfig;
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
}
