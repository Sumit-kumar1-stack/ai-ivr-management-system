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
  | "DTMF_MENU"
  | "TRANSFER"
  | "END_CALL";

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
  Edge;

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