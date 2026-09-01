import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAIResponse: vi.fn(),
}));

vi.mock("@/services/ai/ai-response.service", () => ({
  generateAIResponse: mocks.generateAIResponse,
}));

import { buildFlowCopilotSuggestion } from "@/services/ivr/flow-copilot.service";
import type { IVREdge, IVRNode } from "@/components/ivr/types";

const demoBankGraph = {
  nodes: [
    { id: "start", type: "ivr", position: { x: 100, y: 220 }, data: { nodeKind: "START", label: "Start" } },
    { id: "greeting", type: "ivr", position: { x: 340, y: 220 }, data: { nodeKind: "GREETING", label: "Greeting", prompt: "Welcome to DemoBank Personal Loans." } },
    {
      id: "hybrid_menu", type: "ivr", position: { x: 600, y: 220 }, data: {
        nodeKind: "HYBRID_MENU", label: "Main Menu", prompt: "Press 1 for loan info, 2 for eligibility, 3 for documents, 4 for agent, 9 for goodbye.",
        allowNaturalLanguageEscape: true, escapeNodeId: "knowledge",
        options: [
          { digit: "1", action: "LOAN_INFORMATION", label: "Loan info", destinationNodeId: "knowledge" },
          { digit: "2", action: "CUSTOM", label: "Eligibility", destinationNodeId: "knowledge" },
          { digit: "3", action: "CUSTOM", label: "Documents", destinationNodeId: "knowledge" },
          { digit: "4", action: "HUMAN_AGENT", label: "Agent", destinationNodeId: "human_transfer" },
          { digit: "9", action: "END_CALL", label: "Goodbye", destinationNodeId: "end_call" },
        ],
      },
    },
    { id: "knowledge", type: "ivr", position: { x: 900, y: 100 }, data: { nodeKind: "KNOWLEDGE", label: "Personal Loan Knowledge", knowledgeDocumentIds: ["demo-loan-kb"] } },
    { id: "human_transfer", type: "ivr", position: { x: 900, y: 300 }, data: { nodeKind: "HUMAN_TRANSFER", label: "Human Transfer", transferDestinationId: "agent-1" } },
    { id: "end_call", type: "ivr", position: { x: 1200, y: 220 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Goodbye." } },
  ] as IVRNode[],
  edges: [
    { id: "start-greeting", source: "start", target: "greeting", type: "smoothstep", data: { trigger: "DEFAULT" } },
    { id: "greeting-menu", source: "greeting", target: "hybrid_menu", type: "smoothstep", data: { trigger: "DEFAULT" } },
    { id: "menu-1", source: "hybrid_menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
    { id: "menu-2", source: "hybrid_menu", target: "knowledge", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
    { id: "menu-3", source: "hybrid_menu", target: "knowledge", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
    { id: "menu-4", source: "hybrid_menu", target: "human_transfer", sourceHandle: "4", data: { trigger: "DTMF", value: "4" } },
    { id: "menu-9", source: "hybrid_menu", target: "end_call", sourceHandle: "9", data: { trigger: "DTMF", value: "9" } },
    { id: "knowledge-found", source: "knowledge", target: "hybrid_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
    { id: "knowledge-none", source: "knowledge", target: "hybrid_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
    { id: "transfer-end", source: "human_transfer", target: "end_call", data: { trigger: "HUMAN_TRANSFER" } },
    { id: "transfer-fail", source: "human_transfer", target: "end_call", data: { trigger: "ACTION_FAILURE" } },
  ] as IVREdge[],
};

function modifyContext(overrides: Record<string, unknown> = {}) {
  return {
    mode: "MODIFY" as const,
    prompt: "Add an authentication step before Human Transfer and add key 8 to repeat the main menu.",
    flowName: "DemoBank Loans",
    currentFlow: demoBankGraph,
    supportedNodeKinds: ["START", "GREETING", "HYBRID_MENU", "AI_CONVERSATION", "KNOWLEDGE", "ACTION", "CONDITION", "BUSINESS_HOURS", "AUTH_GATE", "HUMAN_TRANSFER", "CALLBACK", "SEND_INFORMATION", "END_CALL"],
    availableActions: [],
    transferDestinations: [{ id: "agent-1", label: "Agent Queue" }],
    knowledgeDocuments: [{ id: "demo-loan-kb", name: "Demo Loans", status: "ACTIVE", indexed: true }],
    resourceAuthorization: {
      allowedKnowledgeDocumentIds: ["demo-loan-kb"],
      allowedActionCodes: [],
      allowedTransferDestinationIds: ["agent-1"],
      allowedCallbackDestinationIds: [],
      allowedTemplateIds: [],
      allowedBusinessHoursPolicyIds: [],
      allowedAuthenticationLevels: ["AUTH_LEVEL_1"],
    },
    validation: {
      valid: false,
      errors: [
        {
          code: "AUTH_PATH_REQUIRED",
          nodeId: "human_transfer",
          field: "nodeKind",
          message: "Human transfer requires an upstream authentication gate.",
          severity: "ERROR" as const,
        },
      ],
      warnings: [],
      issues: [],
    },
    ...overrides,
  };
}

describe("IVR Copilot Modify Current Draft workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. CREATE mode generates candidate from scratch", async () => {
    const result = await buildFlowCopilotSuggestion({
      ...modifyContext(),
      mode: "GENERATE",
      prompt: "Create DemoBank personal loan flow with knowledge and agent",
      currentFlow: { nodes: [{ id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } }], edges: [] },
    });

    expect(result.candidateFlow?.nodes.length).toBeGreaterThanOrEqual(3);
    expect(result.candidateFlow?.nodes.some(node => node.data.nodeKind === "START")).toBe(true);
  });

  it("2. MODIFY without current nodes is rejected with 422", async () => {
    await expect(buildFlowCopilotSuggestion({
      ...modifyContext(),
      currentFlow: { nodes: [], edges: [] },
    })).rejects.toMatchObject({
      code: "COPILOT_INVALID_REQUEST",
      statusCode: 422,
    });
  });

  it("3. MODIFY preserves unrelated nodes and edges", async () => {
    const result = await buildFlowCopilotSuggestion(modifyContext());
    const candidateNodes = result.candidateFlow?.nodes ?? [];

    expect(candidateNodes.some(n => n.id === "start")).toBe(true);
    expect(candidateNodes.some(n => n.id === "greeting")).toBe(true);
    expect(candidateNodes.some(n => n.id === "hybrid_menu")).toBe(true);
    expect(candidateNodes.some(n => n.id === "knowledge")).toBe(true);
    expect(candidateNodes.some(n => n.id === "end_call")).toBe(true);
  });

  it("4. MODIFY adds AUTH_GATE node and wires repeat menu option 8", async () => {
    const result = await buildFlowCopilotSuggestion(modifyContext());
    const candidateNodes = result.candidateFlow?.nodes ?? [];
    const candidateEdges = result.candidateFlow?.edges ?? [];

    const authNode = candidateNodes.find(n => n.data.nodeKind === "AUTH_GATE");
    expect(authNode).toBeDefined();
    expect(authNode?.data.requiredAuthLevel).toBe("AUTH_LEVEL_1");

    // Option 4 on menu now targets auth node
    const menu = candidateNodes.find(n => n.id === "hybrid_menu");
    const options = (menu?.data.options as unknown as Array<Record<string, unknown>>) ?? [];
    const opt4 = options.find(o => o.digit === "4");
    expect(opt4?.destinationNodeId).toBe("auth_gate");

    // Option 8 added to menu
    const opt8 = options.find(o => o.digit === "8");
    expect(opt8).toBeDefined();
    expect(opt8?.destinationNodeId).toBe("hybrid_menu");

    // Edge from menu with DTMF 8
    expect(candidateEdges.some(e => e.source === "hybrid_menu" && e.data?.value === "8")).toBe(true);

    // Auth gate authenticated edge to human_transfer
    expect(candidateEdges.some(e => e.source === "auth_gate" && e.target === "human_transfer" && e.data?.trigger === "AUTHENTICATED")).toBe(true);
  });

  it("5. Surfacing unsupported node kinds in candidate fails deterministic validation", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Invalid node added",
      candidateFlow: {
        nodes: [
          ...demoBankGraph.nodes,
          { id: "crypto_node", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "CRYPTO_SWAP" } },
        ],
        edges: demoBankGraph.edges,
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.some(e => e.code === "COPILOT_NODE_NOT_SUPPORTED")).toBe(true);
  });

  it("6. Replaces invented or unauthorized knowledge IDs with catalog resources", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Knowledge modified",
      candidateFlow: {
        nodes: demoBankGraph.nodes.map(n => n.id === "knowledge" ? {
          ...n,
          data: { ...n.data, knowledgeDocumentIds: ["unauthorized-doc-xyz"] },
        } : n),
        edges: demoBankGraph.edges,
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    const knowledgeNode = result.candidateFlow?.nodes.find(n => n.id === "knowledge");
    expect(knowledgeNode?.data.knowledgeDocumentIds).toEqual(["demo-loan-kb"]);
  });

  it("7. Replaces unauthorized transfer destination IDs with catalog destination", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Transfer modified",
      candidateFlow: {
        nodes: demoBankGraph.nodes.map(n => n.id === "human_transfer" ? {
          ...n,
          data: { ...n.data, transferDestinationId: "unauthorized-dest-999" },
        } : n),
        edges: demoBankGraph.edges,
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    const transferNode = result.candidateFlow?.nodes.find(n => n.id === "human_transfer");
    expect(transferNode?.data.transferDestinationId).toBe("agent-1");
  });

  it("8. Direct unauthenticated human transfer remains invalid if AUTH_PATH_REQUIRED is bypassed", async () => {
    // Model attempts to remove security check by directly linking menu to human transfer without auth gate
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Direct transfer without auth",
      candidateFlow: demoBankGraph,
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.length).toBeGreaterThan(0);
  });

  it("9. DemoBank Regression: candidate with AUTH_PATH_REQUIRED -> Modify -> Valid with 0 errors", async () => {
    const result = await buildFlowCopilotSuggestion(modifyContext({
      prompt: "Fix AUTH_PATH_REQUIRED using the existing supported authentication node and add DTMF 8 to repeat the Main Menu.",
    }));

    expect(result.validation?.valid).toBe(true);
    expect(result.validation?.errors).toHaveLength(0);
    expect(result.candidateFlow?.nodes.some(n => n.data.nodeKind === "AUTH_GATE")).toBe(true);
    expect(result.candidateFlow?.nodes.find(n => n.id === "knowledge")?.data.knowledgeDocumentIds).toEqual(["demo-loan-kb"]);
    expect(result.candidateFlow?.nodes.find(n => n.id === "human_transfer")?.data.transferDestinationId).toBe("agent-1");
  });

  it("10. User can perform sequential modifications (Modify Draft 1 -> Modify Draft 2)", async () => {
    // Modification 1: Add Auth Gate and DTMF 8
    const step1 = await buildFlowCopilotSuggestion(modifyContext({
      prompt: "Add authentication before human transfer and add DTMF 8 to repeat the menu",
    }));

    expect(step1.validation?.valid).toBe(true);

    // Modification 2: Take step1 candidateFlow and request another modification
    const step2 = await buildFlowCopilotSuggestion(modifyContext({
      prompt: "Change greeting prompt to Welcome to OmniBank Personal Loans.",
      currentFlow: step1.candidateFlow!,
      validation: step1.validation,
    }));

    expect(step2.candidateFlow?.nodes.find(n => n.id === "greeting")?.data.prompt).toBeDefined();
    // Auth gate from step1 remains preserved!
    expect(step2.candidateFlow?.nodes.some(n => n.data.nodeKind === "AUTH_GATE")).toBe(true);
  });

  it("11. LLM candidate with no validation field is accepted and deterministically validated", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Candidate without validation block",
      candidateFlow: {
        nodes: [
          { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
          { id: "greeting", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "GREETING", prompt: "Hello" } },
          { id: "end_call", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "END_CALL", prompt: "Bye" } },
        ],
        edges: [
          { id: "e1", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
          { id: "e2", source: "greeting", target: "end_call", data: { trigger: "DEFAULT" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.candidateFlow?.nodes).toHaveLength(3);
    expect(result.validation).toBeDefined();
    expect(result.validation?.valid).toBe(true);
  });

  it("12. LLM candidate with validation lacking 'valid' boolean is accepted and normalized", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Candidate with incomplete validation object",
      candidateFlow: {
        nodes: [
          { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
          { id: "greeting", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "GREETING", prompt: "Hello" } },
          { id: "end_call", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "END_CALL", prompt: "Bye" } },
        ],
        edges: [
          { id: "e1", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
          { id: "e2", source: "greeting", target: "end_call", data: { trigger: "DEFAULT" } },
        ],
      },
      validation: {
        errors: [],
        warnings: [],
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.candidateFlow?.nodes).toHaveLength(3);
    expect(result.validation).toBeDefined();
    expect(result.validation?.valid).toBe(true);
  });

  it("13. LLM claiming validation.valid = true on invalid graph still produces validation.valid = false", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "LLM falsely claims valid = true on an invalid graph",
      candidateFlow: {
        nodes: [
          { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
          { id: "human_transfer", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1" } },
          { id: "end_call", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "END_CALL", prompt: "Bye" } },
        ],
        edges: [
          { id: "e1", source: "start", target: "human_transfer", data: { trigger: "DEFAULT" } },
          { id: "e2", source: "human_transfer", target: "end_call", data: { trigger: "HUMAN_TRANSFER" } },
          { id: "e3", source: "human_transfer", target: "end_call", data: { trigger: "ACTION_FAILURE" } },
        ],
      },
      validation: {
        valid: true,
        errors: [],
        warnings: [],
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.some(e => e.code === "AUTH_PATH_REQUIRED")).toBe(true);
  });

  it("14. LLM claiming validation.valid = false on valid graph still produces validation.valid = true", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "LLM falsely claims valid = false on a clean graph",
      candidateFlow: {
        nodes: [
          { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
          { id: "greeting", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "GREETING", prompt: "Hello" } },
          { id: "end_call", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "END_CALL", prompt: "Bye" } },
        ],
        edges: [
          { id: "e1", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
          { id: "e2", source: "greeting", target: "end_call", data: { trigger: "DEFAULT" } },
        ],
      },
      validation: {
        valid: false,
        errors: [
          {
            code: "HALLUCINATED_ERROR",
            nodeId: "start",
            field: "nodeKind",
            message: "Hallucinated error",
            severity: "ERROR",
          },
        ],
        warnings: [],
      },
    }));

    const result = await buildFlowCopilotSuggestion(modifyContext());
    expect(result.validation?.valid).toBe(true);
    expect(result.validation?.errors).toHaveLength(0);
  });

  it("15. Structurally invalid candidateFlow is rejected with 422 COPILOT_INVALID_CANDIDATE", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Invalid candidate missing required node structure",
      candidateFlow: {
        nodes: "not-an-array-of-nodes",
      },
    }));

    await expect(buildFlowCopilotSuggestion(modifyContext())).rejects.toMatchObject({
      code: "COPILOT_INVALID_CANDIDATE",
      statusCode: 422,
    });
  });
});
