//--------------------------------------------------
// IVR Semantic Actions
//--------------------------------------------------

export type IVRAction =
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
// IVR Menu Option
//--------------------------------------------------

export interface IVRMenuOption {
  digit: string;

  action: IVRAction;

  label: string;

  response?: string;

  value?: string;
}

//--------------------------------------------------
// IVR Runtime Menu
//--------------------------------------------------

export interface IVRRuntimeMenu {
  type: "DTMF_MENU";

  prompt: string;

  invalidPrompt: string;

  timeoutPrompt: string;

  options: IVRMenuOption[];

  maxAttempts: number;

  exhaustedPrompt: string; 
}

//--------------------------------------------------
// Runtime Resolution
//--------------------------------------------------

export interface IVRResolvedInput {
  valid: boolean;

  digit: string;

  action:
    | IVRAction
    | "INVALID";

  label?: string;

  response: string;

  value?: string;
}