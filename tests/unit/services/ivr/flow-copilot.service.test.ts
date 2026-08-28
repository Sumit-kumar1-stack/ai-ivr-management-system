import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAIResponse: vi.fn(),
}));

vi.mock("@/services/ai/ai-response.service", () => ({
  generateAIResponse: mocks.generateAIResponse,
}));

import { buildFlowCopilotSuggestion } from "@/services/ivr/flow-copilot.service";

const validFlow = {
  nodes: [
    { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
    { id: "greeting", type: "ivr", position: { x: 220, y: 0 }, data: { nodeKind: "GREETING", prompt: "Hello" } },
    { id: "end", type: "ivr", position: { x: 440, y: 0 }, data: { nodeKind: "END_CALL", prompt: "Goodbye" } },
  ],
  edges: [
    { id: "start-greeting", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
    { id: "greeting-end", source: "greeting", target: "end", data: { trigger: "DEFAULT" } },
  ],
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    mode: "GENERATE" as const,
    prompt: "Create a friendly greeting flow",
    flowName: "Tenant Flow",
    currentFlow: { nodes: [], edges: [] },
    supportedNodeKinds: ["START", "GREETING", "HYBRID_MENU", "AI_CONVERSATION", "KNOWLEDGE", "ACTION", "CONDITION", "BUSINESS_HOURS", "AUTH_GATE", "HUMAN_TRANSFER", "CALLBACK", "SEND_INFORMATION", "END_CALL"],
    availableActions: [],
    transferDestinations: [],
    knowledgeDocuments: [],
    resourceAuthorization: {
      allowedKnowledgeDocumentIds: [],
      allowedActionCodes: [],
      allowedTransferDestinationIds: [],
      allowedCallbackDestinationIds: [],
      allowedTemplateIds: [],
      allowedBusinessHoursPolicyIds: [],
      allowedAuthenticationLevels: [],
    },
    ...overrides,
  };
}

describe("flow copilot service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a schema-validated candidate without persisting it", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Greeting candidate",
      warnings: [],
      candidateFlow: validFlow,
    }));

    const result = await buildFlowCopilotSuggestion(context());

    expect(result.validation?.valid).toBe(true);
    expect(result.candidateFlow?.nodes).toHaveLength(3);
    expect(mocks.generateAIResponse).toHaveBeenCalledOnce();
  });

  it("rejects malformed model output without replacing the draft", async () => {
    mocks.generateAIResponse.mockResolvedValue("this is not structured JSON");

    await expect(buildFlowCopilotSuggestion(context())).rejects.toMatchObject({
      code: "COPILOT_MALFORMED_RESPONSE",
      statusCode: 422,
    });
  });

  it("accepts safely normalizable model JSON instead of rejecting it after the model call", async () => {
    mocks.generateAIResponse.mockResolvedValue([
      "The candidate is below:",
      "```json",
      JSON.stringify({
        summary: null,
        warnings: null,
        assumptions: null,
        missingResources: null,
        suggestedTests: null,
        candidateFlow: {
          nodes: validFlow.nodes.map(node => ({ ...node, position: undefined })),
          edges: validFlow.edges.map(edge => ({ ...edge, sourceHandle: null, targetHandle: null })),
        },
      }),
      "```",
    ].join("\n"));

    const result = await buildFlowCopilotSuggestion(context());

    expect(result.validation).toMatchObject({ valid: true, errors: [] });
    expect(result.summary).toBe("Generated an IVR candidate for review.");
    expect(result.candidateFlow?.nodes.every(node => Number.isFinite(node.position.x))).toBe(true);
    expect(result.candidateFlow?.edges.every(edge => edge.sourceHandle === undefined)).toBe(true);
  });

  it("keeps optional catalog availability warnings out of missingResources", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({ summary: "Greeting candidate", candidateFlow: validFlow }));

    const result = await buildFlowCopilotSuggestion(context({
      resourceWarnings: ["No callback configuration is available.", "No business-hours policy is available."],
    }));

    expect(result.missingResources).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "No callback configuration is available.",
      "No business-hours policy is available.",
    ]));
  });

  it("returns the exact six-node DemoBank candidate without calling the model", async () => {
    const result = await buildFlowCopilotSuggestion(context({
      prompt: "Create the DemoBank personal loan inbound menu with loan information, eligibility, documents, an agent, and goodbye.",
      currentFlow: {
        nodes: [{ id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } }],
        edges: [],
      },
      knowledgeDocuments: [{ id: "demo-loan-kb", name: "DemoBank loans", status: "ACTIVE", indexed: true }],
      transferDestinations: [{ id: "agent-1", label: "Authorized agent" }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["demo-loan-kb"], allowedActionCodes: [], allowedTransferDestinationIds: ["agent-1"],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));

    expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    expect(result.candidateFlow?.nodes).toHaveLength(6);
    expect(result.candidateFlow?.edges).toHaveLength(11);
    expect(result.validation).toMatchObject({ valid: false });
    expect(result.validation?.errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
  });

  it("surfaces unsupported node types as deterministic validation errors", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Unsupported candidate",
      warnings: [],
      candidateFlow: {
        ...validFlow,
        nodes: [
          ...validFlow.nodes.slice(0, 2),
          { id: "unsupported", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "PAYMENT_GATE" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context());

    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.map(issue => issue.code)).toContain("COPILOT_NODE_NOT_SUPPORTED");
  });

  it("replaces invented or cross-tenant knowledge IDs with an authorized catalog resource", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Knowledge candidate",
      warnings: [],
      candidateFlow: {
        nodes: [
          validFlow.nodes[0],
          {
            id: "knowledge",
            type: "ivr",
            position: { x: 220, y: 0 },
            data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["tenant-b-document"] },
          },
          validFlow.nodes[2],
        ],
        edges: [
          { id: "start-knowledge", source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
          { id: "knowledge-end", source: "knowledge", target: "end", data: { trigger: "DEFAULT" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context({
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["tenant-a-document"],
        allowedActionCodes: [],
        allowedTransferDestinationIds: [],
        allowedCallbackDestinationIds: [],
        allowedTemplateIds: [],
        allowedBusinessHoursPolicyIds: [],
        allowedAuthenticationLevels: [],
      },
    }));

    expect(result.validation?.valid).toBe(true);
    expect(result.candidateFlow?.nodes.find(node => node.id === "knowledge")?.data.knowledgeDocumentIds).toEqual([
      "tenant-a-document",
    ]);
    expect(result.warnings).toContain("An unavailable knowledge document was requested. The generated flow uses an authorized knowledge document instead.");
  });

  it("removes unavailable callback, business-hours, and action nodes with a safe terminal fallback", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Unsafe candidate",
      candidateFlow: {
        nodes: [
          validFlow.nodes[0],
          { id: "callback", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "CALLBACK", callbackConfigId: "missing" } },
          { id: "hours", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "BUSINESS_HOURS", businessHoursPolicyId: "missing" } },
          { id: "action", type: "ivr", position: { x: 600, y: 0 }, data: { nodeKind: "ACTION", actionCode: "CUSTOM" } },
          validFlow.nodes[2],
        ],
        edges: [
          { id: "start-callback", source: "start", target: "callback", data: { trigger: "DEFAULT" } },
          { id: "callback-hours", source: "callback", target: "hours", data: { trigger: "DEFAULT" } },
          { id: "hours-action", source: "hours", target: "action", data: { trigger: "DEFAULT" } },
          { id: "action-end", source: "action", target: "end", data: { trigger: "DEFAULT" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context());
    const kinds = result.candidateFlow?.nodes.map(node => node.data.nodeKind);

    expect(result.validation?.valid).toBe(true);
    expect(kinds).not.toContain("CALLBACK");
    expect(kinds).not.toContain("BUSINESS_HOURS");
    expect(kinds).not.toContain("ACTION");
    expect(result.warnings.join(" ")).toContain("Callback was requested");
  });

  it("uses the exact authorized transfer destination and adds the executor's failure end-call branch", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Transfer candidate",
      candidateFlow: {
        nodes: [
          validFlow.nodes[0],
          { id: "transfer", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestination: "invented", destinationId: "invented" } },
          validFlow.nodes[2],
        ],
        edges: [
          { id: "start-transfer", source: "start", target: "transfer", data: { trigger: "DEFAULT" } },
          { id: "transfer-end", source: "transfer", target: "end", data: { trigger: "HUMAN_TRANSFER" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context({
      transferDestinations: [{ id: "agent-1", label: "Authorized agent" }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: [], allowedActionCodes: [], allowedTransferDestinationIds: ["agent-1"],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));

    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
    const transferData = result.candidateFlow?.nodes.find(node => node.id === "transfer")?.data;
    expect(transferData?.transferDestinationId).toBe("agent-1");
    expect(transferData).not.toHaveProperty("transferDestination");
    expect(transferData).not.toHaveProperty("destinationId");
    expect(result.candidateFlow?.edges.some(edge => edge.data?.trigger === "HUMAN_TRANSFER" && edge.target === "end")).toBe(true);
    expect(result.candidateFlow?.edges.some(edge => edge.data?.trigger === "ACTION_FAILURE" && edge.target === "end")).toBe(true);
  });

  it("adds voice phrases, natural-language knowledge escape, and knowledge return-to-menu edges", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Loan menu",
      candidateFlow: {
        nodes: [
          validFlow.nodes[0],
          {
            id: "menu", type: "ivr", position: { x: 200, y: 0 }, data: {
              nodeKind: "HYBRID_MENU",
              options: [
                { digit: "1", label: "Loan information", destinationNodeId: "knowledge" },
                { digit: "9", label: "Goodbye", destinationNodeId: "end" },
              ],
            },
          },
          { id: "knowledge", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["demo-loan-kb"] } },
          validFlow.nodes[2],
        ],
        edges: [
          { id: "start-menu", source: "start", target: "menu", data: { trigger: "DEFAULT" } },
          { id: "menu-knowledge", source: "menu", target: "knowledge", data: { trigger: "DTMF", value: "1" } },
          { id: "menu-end", source: "menu", target: "end", data: { trigger: "DTMF", value: "9" } },
          { id: "knowledge-end", source: "knowledge", target: "end", data: { trigger: "DEFAULT" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context({
      knowledgeDocuments: [{ id: "demo-loan-kb", name: "DemoBank_Personal_Loan_Knowledge_Base.pdf", status: "ACTIVE", indexed: true }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["demo-loan-kb"], allowedActionCodes: [], allowedTransferDestinationIds: [],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));
    const menu = result.candidateFlow?.nodes.find(node => node.id === "menu");
    const options = menu?.data.options as unknown as Array<Record<string, unknown>>;

    expect(result.validation?.valid).toBe(true);
    expect(menu?.data.allowNaturalLanguageEscape).toBe(true);
    expect(menu?.data.escapeNodeId).toBe("knowledge");
    expect(options[0]?.voicePhrases).toEqual(expect.arrayContaining(["loan", "loan information", "personal loan"]));
    expect(result.candidateFlow?.edges.filter(edge => edge.source === "knowledge").map(edge => edge.target)).toEqual(["menu", "menu"]);
  });

  it("builds a valid authorized personal-loan menu when the AI provider is unavailable", async () => {
    mocks.generateAIResponse.mockRejectedValue(new Error("provider unavailable"));

    const result = await buildFlowCopilotSuggestion(context({
      prompt: "Create a personal loan menu for loan information, eligibility, documents, and an agent with callback if unavailable.",
      knowledgeDocuments: [{ id: "demo-loan-kb", name: "DemoBank_Personal_Loan_Knowledge_Base.pdf", status: "ACTIVE", indexed: true }],
      transferDestinations: [{ id: "agent-1", label: "Authorized agent" }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["demo-loan-kb"], allowedActionCodes: [], allowedTransferDestinationIds: ["agent-1"],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));
    const kinds = result.candidateFlow?.nodes.map(node => node.data.nodeKind);
    const menu = result.candidateFlow?.nodes.find(node => node.id === "hybrid_menu");

    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
    expect(kinds).toEqual(expect.arrayContaining(["HYBRID_MENU", "KNOWLEDGE", "HUMAN_TRANSFER"]));
    expect(kinds).not.toContain("CALLBACK");
    expect(kinds).not.toContain("BUSINESS_HOURS");
    expect(menu?.data.allowNaturalLanguageEscape).toBe(true);
    expect(result.candidateFlow?.nodes.filter(node => node.data.nodeKind === "KNOWLEDGE").every(node =>
      JSON.stringify(node.data.knowledgeDocumentIds) === JSON.stringify(["demo-loan-kb"])
    )).toBe(true);
  });

  it("normalizes all five DemoBank dtmf menu aliases into canonical executable options", async () => {
    const rawCandidate = {
      nodes: [
        validFlow.nodes[0],
        validFlow.nodes[1],
        {
          id: "menu", type: "ivr", position: { x: 440, y: 0 }, data: {
            nodeKind: "HYBRID_MENU",
            allowNaturalLanguageEscape: true,
            escapeNodeId: "loan-information",
            menuOptions: [
              { dtmf: "1", action: "LOAN_INFORMATION", label: "Loan information", destinationNodeId: "loan-information", voicePhrases: ["loan", "personal loan"], phrases: ["loan details"], intent: "LOAN_INFO", keywords: ["personal loan"] },
              { dtmf: "2", action: "ELIGIBILITY", label: "Eligibility", destinationNodeId: "eligibility", voicePhrases: ["eligibility", "am I eligible"] },
              { dtmf: "3", action: "DOCUMENTS", label: "Documents", destinationNodeId: "documents", voicePhrases: ["documents", "KYC documents"] },
              { dtmf: "4", action: "HUMAN_AGENT", label: "Agent", destinationNodeId: "transfer", voicePhrases: ["agent", "human agent"] },
              { dtmf: "9", action: "GOODBYE", label: "Goodbye", destinationNodeId: "end", voicePhrases: ["goodbye", "exit"] },
            ],
          },
        },
        ...["loan-information", "eligibility", "documents"].map(id => ({
          id, type: "ivr", position: { x: 660, y: 0 }, data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["demo-loan-kb"] },
        })),
        { id: "transfer", type: "ivr", position: { x: 660, y: 160 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1" } },
        { id: "end", type: "ivr", position: { x: 880, y: 0 }, data: { nodeKind: "END_CALL" } },
        { id: "transfer-fallback-end", type: "ivr", position: { x: 880, y: 160 }, data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { id: "start-greeting", source: "start", target: "greeting", type: "smoothstep", sourceHandle: "out", targetHandle: "in", data: { trigger: "DEFAULT" } },
        { id: "greeting-menu", source: "greeting", target: "menu", type: "smoothstep", data: { trigger: "DEFAULT" } },
        { id: "loan", source: "menu", target: "loan-information", type: "smoothstep", data: { trigger: "LOAN_INFORMATION" } },
        { id: "eligibility", source: "menu", target: "eligibility", type: "smoothstep", data: { trigger: "ELIGIBILITY" } },
        { id: "documents", source: "menu", target: "documents", type: "smoothstep", data: { trigger: "DOCUMENTS" } },
        { id: "agent", source: "menu", target: "transfer", type: "smoothstep", data: { trigger: "HUMAN_AGENT" } },
        { id: "goodbye", source: "menu", target: "end", type: "smoothstep", data: { trigger: "GOODBYE" } },
        ...["loan-information", "eligibility", "documents"].flatMap(id => [
          { id: `${id}-found`, source: id, target: "menu", type: "smoothstep", data: { trigger: "KNOWLEDGE_FOUND" } },
          { id: `${id}-missing`, source: id, target: "menu", type: "smoothstep", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
        ]),
        { id: "transfer-success", source: "transfer", target: "end", type: "smoothstep", data: { trigger: "HUMAN_TRANSFER" } },
        { id: "transfer-failure", source: "transfer", target: "transfer-fallback-end", type: "smoothstep", data: { trigger: "ACTION_FAILURE" } },
      ],
    };

    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({ summary: "DemoBank menu", candidateFlow: rawCandidate }));
    const result = await buildFlowCopilotSuggestion(context({
      prompt: "Create the DemoBank personal loan inbound menu",
      knowledgeDocuments: [{ id: "demo-loan-kb", name: "DemoBank loans", status: "ACTIVE", indexed: true }],
      transferDestinations: [{ id: "agent-1", label: "Authorized agent" }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["demo-loan-kb"], allowedActionCodes: [], allowedTransferDestinationIds: ["agent-1"],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));

    expect(result.validation).toMatchObject({ valid: false });
    expect(result.validation?.errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
    expect(result.candidateFlow?.nodes.find(node => node.id === "transfer")?.data).toMatchObject({ transferDestinationId: "agent-1" });
    expect(result.candidateFlow?.edges.filter(edge => edge.source === "menu").map(edge => edge.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ trigger: "DTMF", value: "1" }),
      expect.objectContaining({ trigger: "DTMF", value: "2" }),
      expect.objectContaining({ trigger: "DTMF", value: "3" }),
      expect.objectContaining({ trigger: "DTMF", value: "4" }),
      expect.objectContaining({ trigger: "DTMF", value: "9" }),
    ]));
    expect(result.candidateFlow?.edges.filter(edge => edge.source === "menu" && edge.data?.trigger === "DTMF").map(edge => edge.sourceHandle)).toEqual(["1", "2", "3", "4", "9"]);
    const options = result.candidateFlow?.nodes.find(node => node.id === "menu")?.data.options as unknown as Array<Record<string, unknown>>;
    const menuData = result.candidateFlow?.nodes.find(node => node.id === "menu")?.data;
    expect(options.map(option => option.digit)).toEqual(["1", "2", "3", "4", "9"]);
    expect(options.every(option => !("dtmf" in option))).toBe(true);
    expect(options[0]).toMatchObject({ destinationNodeId: "loan-information", voicePhrases: expect.arrayContaining(["loan", "personal loan"]), phrases: ["loan details"], intent: "LOAN_INFO", keywords: ["personal loan"] });
    expect(menuData).not.toHaveProperty("menuOptions");
    expect(result.candidateFlow?.nodes.find(node => node.id === "menu")?.data).toMatchObject({
      allowNaturalLanguageEscape: true,
      escapeNodeId: "loan-information",
    });
    expect(result.candidateFlow?.edges.filter(edge => edge.source === "loan-information").map(edge => edge.data?.trigger)).toEqual([
      "KNOWLEDGE_FOUND",
      "NO_RELEVANT_KNOWLEDGE",
    ]);
  });

  it("canonicalizes the six-node DemoBank candidate without destination, DTMF, or transfer aliases", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "DemoBank inbound menu",
      candidateFlow: {
        nodes: [
          { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
          { id: "greeting", type: "ivr", position: { x: 180, y: 0 }, data: { nodeKind: "GREETING", prompt: "Welcome to DemoBank." } },
          {
            id: "menu", type: "ivr", position: { x: 360, y: 0 }, data: {
              nodeKind: "HYBRID_MENU",
              escapeNodeId: "knowledge",
              allowNaturalLanguageEscape: true,
              options: [
                { digit: "1", label: "Loan information", targetNodeId: "knowledge", voicePhrases: ["loan information"] },
                { digit: "2", label: "Eligibility", targetNodeId: "knowledge", voicePhrases: ["eligibility"] },
                { digit: "3", label: "Documents", targetNodeId: "knowledge", voicePhrases: ["documents"] },
                { digit: "4", label: "Human agent", targetNodeId: "transfer", voicePhrases: ["agent"] },
                { digit: "9", label: "Goodbye", targetNodeId: "end", voicePhrases: ["goodbye"] },
              ],
            },
          },
          { id: "knowledge", type: "ivr", position: { x: 600, y: 0 }, data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["demo-loan-kb"] } },
          { id: "transfer", type: "ivr", position: { x: 600, y: 160 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1" } },
          { id: "end", type: "ivr", position: { x: 840, y: 0 }, data: { nodeKind: "END_CALL" } },
        ],
        edges: [
          { id: "start-greeting", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
          { id: "greeting-menu", source: "greeting", target: "menu", data: { trigger: "DEFAULT" } },
          ...["1", "2", "3", "4", "9"].map(digit => ({ id: `legacy-menu-${digit}`, source: "menu", target: digit === "4" ? "transfer" : digit === "9" ? "end" : "knowledge", sourceHandle: digit })),
          { id: "knowledge-found", source: "knowledge", target: "menu", data: { trigger: "KNOWLEDGE_FOUND" } },
          { id: "knowledge-missing", source: "knowledge", target: "menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
          { id: "legacy-success", source: "transfer", target: "end", sourceHandle: "success", data: { trigger: "TRANSFER_COMPLETE" } },
          { id: "legacy-failure", source: "transfer", target: "end", sourceHandle: "failure", data: { trigger: "FAILURE" } },
        ],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context({
      prompt: "Create the DemoBank personal loan inbound menu",
      knowledgeDocuments: [{ id: "demo-loan-kb", name: "DemoBank loans", status: "ACTIVE", indexed: true }],
      transferDestinations: [{ id: "agent-1", label: "Authorized agent" }],
      resourceAuthorization: {
        allowedKnowledgeDocumentIds: ["demo-loan-kb"], allowedActionCodes: [], allowedTransferDestinationIds: ["agent-1"],
        allowedCallbackDestinationIds: [], allowedTemplateIds: [], allowedBusinessHoursPolicyIds: [], allowedAuthenticationLevels: [],
      },
    }));

    const flow = result.candidateFlow!;
    const menu = flow.nodes.find(node => node.id === "menu")!;
    const options = menu.data.options as unknown as Array<Record<string, unknown>>;
    const menuEdges = flow.edges.filter(edge => edge.source === "menu");
    const transferEdges = flow.edges.filter(edge => edge.source === "transfer");

    expect(flow.nodes).toHaveLength(6);
    expect(flow.edges).toHaveLength(11);
    expect(result.validation).toMatchObject({ valid: false });
    expect(result.validation?.errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
    expect(options.map(option => option.destinationNodeId)).toEqual(["knowledge", "knowledge", "knowledge", "transfer", "end"]);
    expect(options.every(option => !("targetNodeId" in option))).toBe(true);
    expect(menuEdges.map(edge => ({ handle: edge.sourceHandle, trigger: edge.data?.trigger, value: edge.data?.value, target: edge.target }))).toEqual([
      { handle: "1", trigger: "DTMF", value: "1", target: "knowledge" },
      { handle: "2", trigger: "DTMF", value: "2", target: "knowledge" },
      { handle: "3", trigger: "DTMF", value: "3", target: "knowledge" },
      { handle: "4", trigger: "DTMF", value: "4", target: "transfer" },
      { handle: "9", trigger: "DTMF", value: "9", target: "end" },
    ]);
    expect(transferEdges.map(edge => ({ handle: edge.sourceHandle, trigger: edge.data?.trigger }))).toEqual([
      { handle: undefined, trigger: "HUMAN_TRANSFER" },
      { handle: undefined, trigger: "ACTION_FAILURE" },
    ]);
    expect(flow.edges.filter(edge => edge.source === "knowledge").map(edge => edge.data?.trigger)).toEqual([
      "KNOWLEDGE_FOUND",
      "NO_RELEVANT_KNOWLEDGE",
    ]);
  });

  it("applies modify candidates as validated patches without dropping untouched manual nodes", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Insert a greeting",
      warnings: [],
      candidateFlow: validFlow,
      candidatePatch: {
        operations: [
          { op: "removeEdge", targetId: "start-end" },
          { op: "addNode", targetId: "greeting", node: validFlow.nodes[1] },
          { op: "addEdge", targetId: "start-greeting", edge: validFlow.edges[0] },
          { op: "addEdge", targetId: "greeting-end", edge: validFlow.edges[1] },
        ],
        added: ["greeting", "start-greeting", "greeting-end"],
        modified: [],
        removed: ["start-end"],
      },
    }));

    const result = await buildFlowCopilotSuggestion(context({
      mode: "MODIFY",
      currentFlow: {
        nodes: [
          validFlow.nodes[0],
          { ...validFlow.nodes[2], data: { ...validFlow.nodes[2].data, label: "Manual ending" } },
        ],
        edges: [{ id: "start-end", source: "start", target: "end", data: { trigger: "DEFAULT" } }],
      },
    }));

    expect(result.validation?.valid).toBe(true);
    expect(result.candidateFlow?.nodes.find(node => node.id === "end")?.data.label).toBe("Manual ending");
  });

  it("rejects patches that target nodes outside the current graph", async () => {
    mocks.generateAIResponse.mockResolvedValue(JSON.stringify({
      summary: "Invalid patch",
      warnings: [],
      candidateFlow: validFlow,
      candidatePatch: {
        operations: [{ op: "updateNode", targetId: "missing", patch: { prompt: "Nope" } }],
        added: [],
        modified: ["missing"],
        removed: [],
      },
    }));

    await expect(buildFlowCopilotSuggestion(context({ mode: "MODIFY", currentFlow: validFlow }))).rejects.toMatchObject({
      code: "COPILOT_INVALID_PATCH",
      statusCode: 422,
    });
  });
});
