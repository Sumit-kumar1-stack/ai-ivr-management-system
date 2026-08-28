import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/ai/ai-response.service", () => ({
  generateAIResponse: vi.fn().mockRejectedValue(new Error("ai unavailable")),
}));

import {
  buildFlowCopilotSuggestion,
} from "@/services/ivr/flow-copilot.service";

describe("flow copilot service", () => {
  it("builds a safe heuristic flow when the AI backend is unavailable", async () => {
    const result = await buildFlowCopilotSuggestion({
      mode: "GENERATE",
      prompt:
        "Create a greeting, AI conversation, create lead for interested callers, request callback, transfer to a human, and end the call.",
      flowName: "Outbound Loan Flow",
      currentFlow: {
        nodes: [],
        edges: [],
      },
      supportedNodeKinds: [
        "START",
        "GREETING",
        "AI",
        "ACTION",
        "CONDITION",
        "DTMF_MENU",
        "TRANSFER",
        "END_CALL",
      ],
      availableActions: ["CREATE_LEAD", "REQUEST_CALLBACK"],
      transferDestinations: [],
      knowledgeDocuments: [],
    });

    expect(result.summary.toLowerCase()).toContain("generated");
    expect(result.warnings).toContain(
      "No campaign knowledge is attached. Add approved knowledge before relying on knowledge-grounded answers."
    );
    expect(result.candidateFlow?.nodes.length).toBeGreaterThan(1);
    expect(result.candidateFlow?.edges.length).toBeGreaterThan(0);
  });
});
