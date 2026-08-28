import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import { getCopilotErrorMessage } from "@/components/ivr/flow-copilot-panel";

describe("FlowCopilotPanel API errors", () => {
  it("shows the backend Copilot code, message, and bounded diagnostic details", () => {
    const response = {
      data: {
        code: "COPILOT_INVALID_CANDIDATE",
        message: "The candidate could not be normalized.",
        issues: [{ message: "candidateFlow.nodes[0].id is required" }],
      },
      status: 422,
      statusText: "Unprocessable Entity",
      headers: {},
      config: {} as never,
    };

    const error = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, response);

    expect(getCopilotErrorMessage(error)).toBe(
      "COPILOT_INVALID_CANDIDATE — The candidate could not be normalized. — candidateFlow.nodes[0].id is required"
    );
  });
});
