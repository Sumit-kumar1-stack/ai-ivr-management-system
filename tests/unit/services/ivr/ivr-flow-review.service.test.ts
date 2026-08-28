import { describe, expect, it } from "vitest";

import type { IVREdge, IVRNode } from "@/components/ivr/types";
import { buildIvrFlowReviewSummary, summarizeCopilotPatch, summarizeIvrFlowChange } from "@/services/ivr/ivr-flow-review.service";

const published = {
  nodes: [
    { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start", runtimeMode: "STANDARD" } },
    { id: "end", type: "ivr", position: { x: 220, y: 0 }, data: { nodeKind: "END_CALL", label: "End" } },
  ] satisfies IVRNode[],
  edges: [{ id: "start-end", source: "start", target: "end", data: { trigger: "DEFAULT" } }] satisfies IVREdge[],
};

const current = {
  nodes: [
    { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start", runtimeMode: "AUTO", runtimeDefault: "STANDARD" } },
    { id: "greeting", type: "ivr", position: { x: 120, y: 0 }, data: { nodeKind: "GREETING", label: "Greeting", prompt: "Welcome" } },
    { id: "end", type: "ivr", position: { x: 240, y: 0 }, data: { nodeKind: "END_CALL", label: "End" } },
  ] satisfies IVRNode[],
  edges: [
    { id: "start-greeting", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
    { id: "greeting-end", source: "greeting", target: "end", data: { trigger: "DEFAULT" } },
  ] satisfies IVREdge[],
};

describe("IVR flow review summary", () => {
  it("summarizes graph changes and keeps them human readable", () => {
    const summary = summarizeIvrFlowChange(published, current);

    expect(summary.noMaterialChanges).toBe(false);
    const nodeText = summary.nodeChanges.map(item => `${item.title} ${item.detail}`).join(" ");
    const edgeText = summary.edgeChanges.map(item => `${item.title} ${item.detail}`).join(" ");

    expect(nodeText).toContain("Updated node Start");
    expect(nodeText).toContain("Runtime mode changed from STANDARD to AUTO");
    expect(nodeText).toContain("Added node Greeting");
    expect(edgeText).toContain("Added edge start → greeting");
  });

  it("surfaces a clean no-change summary when graphs match", () => {
    expect(summarizeIvrFlowChange(published, published)).toMatchObject({
      noMaterialChanges: true,
      summary: "No material changes were detected between the two graph snapshots.",
    });
  });

  it("turns Copilot patches into a clean change summary", () => {
    const lines = summarizeCopilotPatch(
      published,
      current
    );

    expect(lines.join(" ")).toContain("Updated node Start");
    expect(lines.join(" ")).toContain("Added node Greeting");
  });

  it("builds a reviewer-friendly snapshot with validation, simulation, and usage notes", () => {
    const review = buildIvrFlowReviewSummary({
      currentFlow: { name: "Loan Flow", version: 7, nodes: current.nodes as never, edges: current.edges as never },
      publishedVersion: { versionNumber: 6, nodes: published.nodes as never, edges: published.edges as never },
      validation: {
        valid: false,
        errors: [{ code: "MISSING_START", message: "Missing START node", severity: "ERROR", nodeId: null }],
        warnings: [{ code: "MISSING_FALLBACK", message: "Missing fallback", severity: "WARNING", nodeId: null }],
        issues: [{ code: "MISSING_START", message: "Missing START node", severity: "ERROR", nodeId: null }],
      } as never,
      simulation: {
        validation: { valid: true },
        currentNodeId: "start",
        resultingNodeId: "greeting",
        transition: "DEFAULT",
        responsePreview: "Welcome",
        knowledgeScopeSummary: "none",
        warnings: ["Simulation warning"],
        trace: ["Current node: start"],
      } as never,
      inboundProfiles: [
        { id: "profile-1", name: "Main IVR", active: true, provider: "Plivo", inboundNumberMasked: "+12••••3456", voiceRuntime: "STANDARD", ivrFlowVersionId: "version-1" },
      ],
    });

    expect(review.submissionSummary).toContain("relative to v6");
    expect(review.validationFindings.map(item => `${item.title} ${item.detail}`).join(" ")).toContain("Missing START node");
    expect(review.simulationFindings.map(item => `${item.title} ${item.detail}`).join(" ")).toContain("Simulation warning");
    expect(review.usageFindings.map(item => `${item.title} ${item.detail}`).join(" ")).toContain("Main IVR");
    expect(review.structureFindings[0].title).toContain("Compared with v6");
  });
});
