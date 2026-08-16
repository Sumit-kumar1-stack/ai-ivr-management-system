import type {
  ZodTypeAny,
} from "zod";

//--------------------------------------------------
// Tool Names
//--------------------------------------------------

export type BusinessToolName =
  | "searchKnowledgeBase"
  | "bookCallback"
  | "createLead"
  | "transferToHuman"
  | "sendSms"
  | "sendWhatsApp"
  | "endCall"
  | "recordConsent";

//--------------------------------------------------
// Tool Risk
//--------------------------------------------------

export type BusinessToolRisk =
  | "READ_ONLY"
  | "LOW"
  | "SENSITIVE";

//--------------------------------------------------
// Tool Execution Context
//--------------------------------------------------

export interface ToolExecutionContext {
  callId: string;

  tenantId?:
    string;

  idempotencyKey?:
    string;

  requestedBy:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  signal:
    AbortSignal;
}

//--------------------------------------------------
// Tool Handler
//--------------------------------------------------

export type ToolHandler =
  (
    input: unknown,
    context: ToolExecutionContext
  ) => Promise<unknown>;

//--------------------------------------------------
// Tool Definition
//--------------------------------------------------

export interface BusinessToolDefinition {
  name:
    BusinessToolName;

  description:
    string;

  risk:
    BusinessToolRisk;

  mutating:
    boolean;

  requiresConfirmation:
    boolean;

  timeoutMs:
    number;

  inputSchema:
    ZodTypeAny;

  handler:
    ToolHandler;
}

//--------------------------------------------------
// Gateway Request
//--------------------------------------------------

export interface ExecuteBusinessToolRequest {
  tool:
    BusinessToolName;

  callId:
    string;

  input:
    unknown;

  tenantId?:
    string;

  idempotencyKey?:
    string;

  requestedBy:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  confirmed?:
    boolean;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Gateway Success
//--------------------------------------------------

export interface ToolExecutionSuccess {
  success:
    true;

  tool:
    BusinessToolName;

  callId:
    string;

  durationMs:
    number;

  result:
    unknown;
}

//--------------------------------------------------
// Gateway Failure
//--------------------------------------------------

export interface ToolExecutionFailure {
  success:
    false;

  tool:
    BusinessToolName;

  callId:
    string;

  durationMs:
    number;

  error: {
    code:
      string;

    message:
      string;
  };
}

//--------------------------------------------------
// Gateway Result
//--------------------------------------------------

export type ToolExecutionResult =
  | ToolExecutionSuccess
  | ToolExecutionFailure;