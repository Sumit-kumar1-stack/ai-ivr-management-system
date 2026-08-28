import { describe, expect, it } from "vitest";

import {
  analyzeIvrNodeDeletion,
  deleteIvrNodeWithCleanup,
} from "@/components/ivr/ivr-builder-delete-utils";
import type { IVREdge, IVRNode } from "@/components/ivr/types";

const nodes = [
  { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start", nextNodeId: "menu", defaultAiNodeId: "ai" } },
  {
    id: "menu",
    type: "ivr",
    position: { x: 200, y: 0 },
    data: {
      nodeKind: "HYBRID_MENU",
      label: "Loan Menu",
      fallbackNodeId: "auth",
      escapeNodeId: "auth",
      options: [
        { digit: "1", label: "Check status", action: "CUSTOM", destinationNodeId: "auth" },
        { digit: "2", label: "Callback", action: "REQUEST_CALLBACK", destinationNodeId: "callback" },
      ],
      runtimeMenu: {
        type: "DTMF_MENU",
        prompt: "Choose an option",
        invalidPrompt: "Invalid",
        timeoutPrompt: "Timeout",
        exhaustedPrompt: "Exhausted",
        maxAttempts: 3,
        options: [{ digit: "3", label: "Agent", action: "HUMAN_AGENT", destinationNodeId: "transfer" }],
      },
    },
  },
  { id: "auth", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "AUTH_GATE", label: "Authentication", fallbackNodeId: "callback" } },
  { id: "tool", type: "ivr", position: { x: 600, y: 0 }, data: { nodeKind: "ACTION", label: "Account lookup", actionCode: "LOOKUP" } },
  { id: "transfer", type: "ivr", position: { x: 600, y: 150 }, data: { nodeKind: "HUMAN_TRANSFER", label: "Agent Transfer", transferDestinationId: "agent-1" } },
  { id: "callback", type: "ivr", position: { x: 600, y: 300 }, data: { nodeKind: "CALLBACK", label: "Request Callback" } },
  { id: "ai", type: "ivr", position: { x: 400, y: 300 }, data: { nodeKind: "AI_CONVERSATION", label: "AI" } },
  { id: "end", type: "ivr", position: { x: 800, y: 0 }, data: { nodeKind: "END_CALL", label: "End" } },
] satisfies IVRNode[];

const edges = [
  { id: "start-menu", source: "start", target: "menu" },
  { id: "menu-auth", source: "menu", target: "auth", data: { trigger: "DTMF", value: "1" } },
  { id: "menu-callback", source: "menu", target: "callback", data: { trigger: "DTMF", value: "2" } },
  { id: "menu-transfer", source: "menu", target: "transfer", data: { trigger: "DTMF", value: "3" } },
  { id: "auth-tool", source: "auth", target: "tool", data: { trigger: "AUTHENTICATED" } },
  { id: "auth-callback", source: "auth", target: "callback", data: { trigger: "NOT_AUTHENTICATED" } },
  { id: "tool-end", source: "tool", target: "end", data: { trigger: "ACTION_SUCCESS" } },
  { id: "callback-end", source: "callback", target: "end", data: { trigger: "DEFAULT" } },
  { id: "transfer-end", source: "transfer", target: "end", data: { trigger: "HUMAN_TRANSFER" } },
] satisfies IVREdge[];

describe("IVR builder deletion helpers", () => {
  it("protects the START node and does not mutate it", () => {
    const impact = analyzeIvrNodeDeletion(nodes, edges, "start");
    const result = deleteIvrNodeWithCleanup(nodes, edges, "start");

    expect(impact).toMatchObject({ canDelete: false, isProtected: true, blockedReason: "START_NODE" });
    expect(impact.importance).toContain("FLOW_ENTRY");
    expect(result).toMatchObject({ deleted: false, nodes, edges });
  });

  it("reports incoming, outgoing, fallback, route-target, and START reachability impact", () => {
    const impact = analyzeIvrNodeDeletion(nodes, edges, "auth");

    expect(impact.incomingEdges.map(edge => edge.id)).toEqual(["menu-auth"]);
    expect(impact.outgoingEdges.map(edge => edge.id)).toEqual(["auth-tool", "auth-callback"]);
    expect(impact.fallbackReferences).toEqual([
      { sourceNodeId: "menu", sourceNodeLabel: "Loan Menu", field: "fallbackNodeId" },
      { sourceNodeId: "menu", sourceNodeLabel: "Loan Menu", field: "escapeNodeId" },
    ]);
    expect(impact.routeTargetReferences).toEqual([
      { sourceNodeId: "menu", sourceNodeLabel: "Loan Menu", field: "options.destinationNodeId", optionDigit: "1" },
    ]);
    expect(impact.startReachabilityImpact).toEqual({ affectedNodeIds: ["tool"], affectedCount: 1 });
    expect(impact.importance).toEqual(expect.arrayContaining(["AUTHENTICATION", "ROUTING_BRIDGE", "START_REACHABILITY"]));
    expect(impact.requiresConfirmation).toBe(true);
  });

  it("marks business tools, agent transfers, callbacks, and the sole terminal as important", () => {
    expect(analyzeIvrNodeDeletion(nodes, edges, "tool").importance).toEqual(expect.arrayContaining(["BUSINESS_TOOL"]));
    expect(analyzeIvrNodeDeletion(nodes, edges, "transfer").importance).toEqual(expect.arrayContaining(["AGENT_TRANSFER"]));
    expect(analyzeIvrNodeDeletion(nodes, edges, "callback").importance).toEqual(expect.arrayContaining(["CALLBACK"]));
    expect(analyzeIvrNodeDeletion(nodes, edges, "end").importance).toEqual(expect.arrayContaining(["ONLY_TERMINAL"]));
  });

  it("allows an isolated ordinary node to be deleted without confirmation", () => {
    const isolated: IVRNode = {
      id: "note",
      type: "ivr",
      position: { x: 0, y: 0 },
      data: { nodeKind: "GREETING", label: "Unused greeting" },
    };
    const impact = analyzeIvrNodeDeletion([...nodes, isolated], edges, isolated.id);

    expect(impact).toMatchObject({ canDelete: true, requiresConfirmation: false, isStructurallyImportant: false });
  });

  it("cleans attached edges and canonical graph references without mutating the source graph", () => {
    const originalMenu = nodes.find(node => node.id === "menu")!;
    const result = deleteIvrNodeWithCleanup(nodes, edges, "auth");
    const menu = result.nodes.find(node => node.id === "menu")!;

    expect(result.deleted).toBe(true);
    expect(result.nodes.map(node => node.id)).not.toContain("auth");
    expect(result.edges.map(edge => edge.id)).not.toEqual(expect.arrayContaining(["menu-auth", "auth-tool", "auth-callback"]));
    expect(result.edges.every(edge => edge.source !== "auth" && edge.target !== "auth")).toBe(true);
    expect(menu.data.fallbackNodeId).toBeUndefined();
    expect(menu.data.escapeNodeId).toBeUndefined();
    expect(menu.data.options?.[0]?.destinationNodeId).toBeUndefined();
    expect(originalMenu.data.fallbackNodeId).toBe("auth");
    expect(originalMenu.data.options?.[0]?.destinationNodeId).toBe("auth");
  });

  it("cleans START route references and menu/runtime-menu target references", () => {
    const result = deleteIvrNodeWithCleanup(nodes, edges, "ai");
    const start = result.nodes.find(node => node.id === "start")!;
    expect(start.data.defaultAiNodeId).toBeUndefined();

    const transferResult = deleteIvrNodeWithCleanup(nodes, edges, "transfer");
    const menu = transferResult.nodes.find(node => node.id === "menu")!;
    expect(menu.data.runtimeMenu?.options?.[0]?.destinationNodeId).toBeUndefined();
  });

  it("does not delete a read-only graph or unknown node", () => {
    const readOnly = deleteIvrNodeWithCleanup(nodes, edges, "auth", { isEditable: false });
    const unknown = deleteIvrNodeWithCleanup(nodes, edges, "missing");

    expect(readOnly.impact.blockedReason).toBe("READ_ONLY");
    expect(readOnly).toMatchObject({ deleted: false, nodes, edges });
    expect(unknown.impact.blockedReason).toBe("NODE_NOT_FOUND");
    expect(unknown).toMatchObject({ deleted: false, nodes, edges });
  });
});
