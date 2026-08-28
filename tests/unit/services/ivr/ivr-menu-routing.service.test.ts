import { describe, expect, it } from "vitest";

import { normalizeIVRMenuRouting } from "@/services/ivr/ivr-menu-routing.service";
import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";

const menuNode = {
  id: "main-menu",
  data: {
    nodeKind: "HYBRID_MENU",
    escapeNodeId: "knowledge-base",
    options: [
      { digit: "1", label: "Loan information", destinationNodeId: "knowledge-base" },
      { digit: "2", label: "Eligibility", destinationNodeId: "knowledge-base" },
      { digit: "3", label: "Documents", destinationNodeId: "knowledge-base" },
      { digit: "4", label: "Agent", destinationNodeId: "auth-gate" },
      { digit: "9", label: "Goodbye", destinationNodeId: "end-call" },
    ],
  },
};

function validSharedKnowledgeGraph() {
  return {
    nodes: [
      { id: "start", data: { nodeKind: "START" } },
      menuNode,
      { id: "knowledge-base", data: { nodeKind: "KNOWLEDGE" } },
      { id: "auth-gate", data: { nodeKind: "AUTH_GATE", requiredAuthLevel: "STANDARD" } },
      { id: "human-transfer", data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "destination-1" } },
      { id: "end-call", data: { nodeKind: "END_CALL" } },
    ],
    edges: [
      { id: "start-menu", source: "start", target: "main-menu", data: { trigger: "DEFAULT" } },
      { id: "one", source: "main-menu", target: "knowledge-base", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
      { id: "two", source: "main-menu", target: "knowledge-base", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
      { id: "three", source: "main-menu", target: "knowledge-base", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
      { id: "four", source: "main-menu", target: "auth-gate", sourceHandle: "4", data: { trigger: "DTMF", value: "4" } },
      { id: "nine", source: "main-menu", target: "end-call", sourceHandle: "9", data: { trigger: "DTMF", value: "9" } },
      { id: "fallback", source: "main-menu", target: "knowledge-base", sourceHandle: "fallback", data: { trigger: "FALLBACK", value: "fallback" } },
      { id: "auth-success", source: "auth-gate", target: "human-transfer", data: { trigger: "AUTHENTICATED" } },
      { id: "transfer-success", source: "human-transfer", target: "end-call", data: { trigger: "HUMAN_TRANSFER" } },
      { id: "transfer-failure", source: "human-transfer", target: "end-call", data: { trigger: "ACTION_FAILURE" } },
    ],
  };
}

describe("IVR menu routing normalization", () => {
  it("promotes targetNodeId while preserving an already canonical destinationNodeId", () => {
    const result = normalizeIVRMenuRouting({
      nodes: [{
        id: "menu",
        data: {
          nodeKind: "HYBRID_MENU",
          options: [
            { digit: "1", label: "Loan information", targetNodeId: "knowledge" },
            { digit: "9", label: "Goodbye", destinationNodeId: "end", targetNodeId: "ignored-legacy-alias" },
          ],
        },
      }],
      edges: [],
    });

    const options = (result.nodes[0]?.data as Record<string, unknown>).options as Array<Record<string, unknown>>;
    expect(options).toEqual([
      { digit: "1", label: "Loan information", destinationNodeId: "knowledge" },
      { digit: "9", label: "Goodbye", destinationNodeId: "end" },
    ]);
  });

  it("upgrades the AI menuOptions alias to canonical options without dropping supported fields", () => {
    const result = normalizeIVRMenuRouting({
      nodes: [{
        id: "menu",
        data: {
          nodeKind: "HYBRID_MENU",
          menuOptions: [{
            dtmf: "1",
            label: "Loan information",
            destinationNodeId: "knowledge-base",
            voicePhrases: ["loan"],
            phrases: ["loan details"],
            intent: "LOAN_INFO",
            keywords: ["personal loan"],
            response: "Here is loan information.",
          }],
        },
      }],
      edges: [],
    });

    const data = result.nodes[0]?.data as Record<string, unknown>;
    expect(data.options).toEqual([{
      digit: "1",
      label: "Loan information",
      destinationNodeId: "knowledge-base",
      voicePhrases: ["loan"],
      phrases: ["loan details"],
      intent: "LOAN_INFO",
      keywords: ["personal loan"],
      response: "Here is loan information.",
    }]);
    expect(data).not.toHaveProperty("menuOptions");
  });

  it("rebuilds conflicting and incomplete AI DTMF metadata from canonical options", () => {
    const result = normalizeIVRMenuRouting({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        menuNode,
        { id: "knowledge-base", data: { nodeKind: "KNOWLEDGE" } },
        { id: "human-transfer", data: { nodeKind: "HUMAN_TRANSFER" } },
        { id: "end-call", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { id: "start-menu", source: "start", target: "main-menu", data: { trigger: "DEFAULT" } },
        { id: "bad-one", source: "main-menu", target: "knowledge-base", sourceHandle: "1", data: { trigger: "DTMF", value: "3" } },
        { id: "missing-two", source: "main-menu", target: "knowledge-base", sourceHandle: "2" },
      ],
    });

    const routes = result.edges.filter(edge => edge.source === "main-menu" && edge.data?.trigger === "DTMF");
    expect(routes).toHaveLength(5);
    expect(routes.map(edge => ({ handle: edge.sourceHandle, value: edge.data?.value, target: edge.target }))).toEqual([
      { handle: "1", value: "1", target: "knowledge-base" },
      { handle: "2", value: "2", target: "knowledge-base" },
      { handle: "3", value: "3", target: "knowledge-base" },
      { handle: "4", value: "4", target: "auth-gate" },
      { handle: "9", value: "9", target: "end-call" },
    ]);
  });

  it("rejects conflicting DTMF metadata that bypasses normalization", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "menu", data: { ...menuNode.data, options: [menuNode.data.options[0]] } },
        { id: "knowledge-base", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "knowledge-base", sourceHandle: "1", data: { trigger: "DTMF", value: "3" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "MENU_DTMF_ROUTE_INVALID",
      "MENU_DTMF_METADATA_CONFLICT",
    ]));
  });

  it("accepts 1, 2, and 3 sharing a Knowledge destination with canonical metadata", () => {
    const result = validateIVRFlowDefinition(validSharedKnowledgeGraph());

    expect(result).toMatchObject({ valid: true });
    expect(result.errors).toHaveLength(0);
  });

  it("validates a legacy menuOptions graph through its read-only compatibility alias", () => {
    const graph = validSharedKnowledgeGraph();
    const menu = graph.nodes.find(node => node.id === "main-menu") as { data: Record<string, unknown> };
    const options = menu.data.options;
    menu.data = { ...menu.data, menuOptions: options };
    delete menu.data.options;

    expect(validateIVRFlowDefinition(graph)).toMatchObject({ valid: true, errors: [] });
  });

  it("does not let fallback routing participate in DTMF conflict detection", () => {
    const result = validateIVRFlowDefinition(validSharedKnowledgeGraph());

    expect(result.errors.map(issue => issue.code)).not.toContain("MENU_DTMF_METADATA_CONFLICT");
  });

  it("rejects an edge whose DTMF value claims another option digit", () => {
    const graph = validSharedKnowledgeGraph();
    graph.edges.find(edge => edge.id === "one")!.data!.value = "3";

    expect(validateIVRFlowDefinition(graph).errors.map(issue => issue.code)).toContain("MENU_DTMF_METADATA_CONFLICT");
  });

  it("rejects an edge whose source handle claims another option digit", () => {
    const graph = validSharedKnowledgeGraph();
    graph.edges.find(edge => edge.id === "one")!.sourceHandle = "2";

    expect(validateIVRFlowDefinition(graph).errors.map(issue => issue.code)).toContain("MENU_DTMF_METADATA_CONFLICT");
  });

  it("rejects a digit route with the wrong destination", () => {
    const graph = validSharedKnowledgeGraph();
    graph.edges.find(edge => edge.id === "one")!.target = "end-call";

    expect(validateIVRFlowDefinition(graph).errors.map(issue => issue.code)).toContain("MENU_DTMF_METADATA_CONFLICT");
  });

  it("rejects duplicate canonical edges for one digit", () => {
    const graph = validSharedKnowledgeGraph();
    graph.edges.push({ id: "one-duplicate", source: "main-menu", target: "knowledge-base", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } });

    expect(validateIVRFlowDefinition(graph).errors.map(issue => issue.code)).toContain("MENU_DTMF_ROUTE_INVALID");
  });

  it("rejects a missing canonical route for one digit", () => {
    const graph = validSharedKnowledgeGraph();
    graph.edges = graph.edges.filter(edge => edge.id !== "one");

    expect(validateIVRFlowDefinition(graph).errors.map(issue => issue.code)).toContain("MENU_DTMF_ROUTE_INVALID");
  });

  it.each(["two", "three"])("does not confuse %s with option 1 because they share a target", edgeId => {
    const graph = validSharedKnowledgeGraph();
    const result = validateIVRFlowDefinition(graph);

    expect(graph.edges.find(edge => edge.id === edgeId)?.target).toBe("knowledge-base");
    expect(result.errors).toHaveLength(0);
  });
});
