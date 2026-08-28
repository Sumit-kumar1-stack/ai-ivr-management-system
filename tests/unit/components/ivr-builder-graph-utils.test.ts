import { describe, expect, it } from "vitest";
import { duplicateIvrNode, edgeBusinessLabel, layoutIvrGraph, searchIvrNodes } from "@/components/ivr/ivr-builder-graph-utils";
import type { IVREdge, IVRNode } from "@/components/ivr/types";

const nodes = [
  { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start" } },
  { id: "menu", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "HYBRID_MENU", label: "Loan menu", options: [{ digit: "1", label: "Loans", action: "CUSTOM", intent: "PERSONAL_LOAN" }] } },
  { id: "knowledge", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "KNOWLEDGE", label: "Loan KB", knowledgeDocumentIds: ["kb-loan"], department: "Loans" } },
] satisfies IVRNode[];
const edges = [{ id: "a", source: "start", target: "menu", data: { trigger: "DEFAULT" } }, { id: "b", source: "menu", target: "knowledge", data: { trigger: "DTMF", value: "1" } }] satisfies IVREdge[];

describe("IVR builder graph helpers", () => {
  it("derives meaningful edge labels without mutating graph truth", () => {
    expect(edgeBusinessLabel(edges[1], nodes)).toBe("1 — Loans");
    expect(edgeBusinessLabel(edges[0], nodes)).toBe("Default");
  });
  it("lays out deterministically without altering IDs or edges", () => {
    const first = layoutIvrGraph(nodes, edges); const second = layoutIvrGraph(nodes, edges);
    expect(first).toEqual(second); expect(first.map(node => node.id)).toEqual(nodes.map(node => node.id)); expect(edges.map(edge => edge.id)).toEqual(["a", "b"]);
  });
  it("searches labels, types, intents, knowledge and departments without mutation", () => {
    expect(searchIvrNodes(nodes, "loan").map(node => node.id)).toEqual(["menu", "knowledge"]);
    expect(searchIvrNodes(nodes, "personal_loan").map(node => node.id)).toEqual(["menu"]);
    expect(searchIvrNodes(nodes, "missing")).toEqual([]);
  });
  it("duplicates with a unique ID, offset position, copied config, and no edges", () => {
    const copy = duplicateIvrNode(nodes[1], nodes);
    expect(copy.id).not.toBe(nodes[1].id); expect(copy.position).toEqual({ x: 40, y: 40 }); expect(copy.data.options).toEqual(nodes[1].data.options); expect(edges).toHaveLength(2);
  });
});
