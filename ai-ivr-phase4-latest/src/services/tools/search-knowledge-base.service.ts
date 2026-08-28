import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestKnowledgeSearchInput {
  callId:
    string;

  query:
    string;

  limit?:
    number;

  requestedBy?:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Request
//--------------------------------------------------

export async function requestKnowledgeSearch(
  input:
    RequestKnowledgeSearchInput
): Promise<ToolExecutionResult> {
  return executeBusinessTool({
    tool:
      "searchKnowledgeBase",

    callId:
      input.callId,

    input: {
      query:
        input.query,

      limit:
        input.limit,
    },

    /*
     * Read-only tool.
     */
    confirmed:
      true,

    requestedBy:
      input.requestedBy ??
      "AI",

    signal:
      input.signal,
  });
}