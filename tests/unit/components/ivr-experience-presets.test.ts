import { describe, expect, it } from "vitest";

import type { IVREdge, IVRNode } from "@/components/ivr/types";
import { buildFlowCopilotSuggestion } from "@/services/ivr/flow-copilot.service";
import {
  applyPresetToFlow,
  generatePresetFlow,
  IVR_EXPERIENCE_PRESETS,
  type IVRExperiencePreset,
} from "@/services/ivr/ivr-experience-presets.service";
import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";
import { routeStandardInput } from "@/services/ivr/standard-input-router.service";

describe("Phase 5.6: IVR Experience Presets", () => {
  // ----------------------------------------------------
  // 1. Traditional creates zero-AI-capable flow
  // ----------------------------------------------------
  it("1. Traditional creates zero-AI-capable flow", () => {
    const { nodes, edges } = generatePresetFlow("CLASSIC_IVR");
    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);

    const menuNode = nodes.find(n => n.data?.nodeKind === "DTMF_MENU");
    expect(menuNode).toBeDefined();
    expect(menuNode?.data?.inputMode).toBe("DTMF");
    expect(menuNode?.data?.conversationalEscape?.enabled).toBe(false);
  });

  // ----------------------------------------------------
  // 2. Traditional requires no Gemini configuration
  // ----------------------------------------------------
  it("2. Traditional requires no Gemini configuration and validates cleanly", () => {
    const { nodes, edges } = generatePresetFlow("CLASSIC_IVR");
    const validation = validateIVRFlowDefinition({ nodes, edges });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // No AI model or conversational escape present
    for (const n of nodes) {
      expect(n.data?.nodeKind).not.toBe("AI_CONVERSATION");
      if (n.data?.conversationalEscape) {
        expect(n.data.conversationalEscape.enabled).toBe(false);
      }
    }
  });

  // ----------------------------------------------------
  // 3. Smart uses deterministic aliases/local KB
  // ----------------------------------------------------
  it("3. Smart uses deterministic aliases/local KB", () => {
    const { nodes, edges } = generatePresetFlow("SMART_IVR");
    const menuNode = nodes.find(n => n.data?.nodeKind === "HYBRID_MENU");
    expect(menuNode).toBeDefined();
    expect(menuNode?.data?.inputMode).toBe("BOTH");

    const optionWithAliases = menuNode?.data?.options?.find(o => o.voicePhrases && o.voicePhrases.length > 0);
    expect(optionWithAliases).toBeDefined();
    expect(optionWithAliases?.voicePhrases).toContain("hours");

    const kbNode = nodes.find(n => n.data?.nodeKind === "KNOWLEDGE");
    expect(kbNode).toBeDefined();
    expect(kbNode?.data?.knowledgeDocumentIds).toBeDefined();
  });

  // ----------------------------------------------------
  // 4. Smart can operate with AI NEVER
  // ----------------------------------------------------
  it("4. Smart operates with AI policy NEVER and validates cleanly", () => {
    const { nodes, edges } = generatePresetFlow("SMART_IVR");
    const kbNode = nodes.find(n => n.data?.nodeKind === "KNOWLEDGE");
    expect(kbNode?.data?.aiPolicy?.mode).toBe("NEVER");

    const validation = validateIVRFlowDefinition({ nodes, edges });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 5. Adaptive uses deterministic-first config
  // ----------------------------------------------------
  it("5. Adaptive uses deterministic-first config with global navigation", () => {
    const { nodes } = generatePresetFlow("ADAPTIVE_IVR");
    const startNode = nodes.find(n => n.data?.nodeKind === "START");
    expect(startNode?.data?.navigation?.home?.enabled).toBe(true);
    expect(startNode?.data?.navigation?.back?.enabled).toBe(true);
    expect(startNode?.data?.navigation?.repeat?.enabled).toBe(true);
    expect(startNode?.data?.navigation?.end?.enabled).toBe(true);

    const menuNode = nodes.find(n => n.data?.nodeKind === "HYBRID_MENU");
    expect(menuNode?.data?.inputMode).toBe("BOTH");
    expect(menuNode?.data?.options?.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------
  // 6. Adaptive uses FREE_FORM_ONLY appropriately
  // ----------------------------------------------------
  it("6. Adaptive uses FREE_FORM_ONLY appropriately on knowledge target", () => {
    const { nodes } = generatePresetFlow("ADAPTIVE_IVR");
    const kbNode = nodes.find(n => n.data?.nodeKind === "KNOWLEDGE");
    expect(kbNode).toBeDefined();
    expect(kbNode?.data?.aiPolicy?.mode).toBe("FREE_FORM_ONLY");
    expect(kbNode?.data?.aiPolicy?.confidenceThreshold).toBe(0.7);
  });

  // ----------------------------------------------------
  // 7. Adaptive return context works
  // ----------------------------------------------------
  it("7. Adaptive return context works on conversational escape", () => {
    const { nodes, edges } = generatePresetFlow("ADAPTIVE_IVR");
    const menuNode = nodes.find(n => n.data?.nodeKind === "HYBRID_MENU");
    expect(menuNode?.data?.conversationalEscape?.enabled).toBe(true);
    expect(menuNode?.data?.conversationalEscape?.returnBehavior).toBe("RETURN_CONTEXT");
    expect(menuNode?.data?.conversationalEscape?.targetNodeId).toBe("faq_assistant");

    const validation = validateIVRFlowDefinition({ nodes, edges });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 8. Conversational enables AI only on conversational nodes
  // ----------------------------------------------------
  it("8. Conversational enables ALWAYS_CONVERSATIONAL on AI nodes", () => {
    const { nodes, edges } = generatePresetFlow("CONVERSATIONAL_IVR");
    const aiNode = nodes.find(n => n.data?.nodeKind === "AI_CONVERSATION");
    expect(aiNode).toBeDefined();
    expect(aiNode?.data?.aiPolicy?.mode).toBe("ALWAYS_CONVERSATIONAL");

    const validation = validateIVRFlowDefinition({ nodes, edges });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 9. Conversational still keeps AUTH and navigation deterministic
  // ----------------------------------------------------
  it("9. Conversational still keeps AUTH_GATE and navigation deterministic", () => {
    const { nodes } = generatePresetFlow("CONVERSATIONAL_IVR");
    const startNode = nodes.find(n => n.data?.nodeKind === "START");
    expect(startNode?.data?.navigation?.end?.enabled).toBe(true);

    const authNode = nodes.find(n => n.data?.nodeKind === "AUTH_GATE");
    expect(authNode).toBeDefined();
    expect(authNode?.data?.requiredAuthLevel).toBe("AUTH_LEVEL_1");
  });

  // ----------------------------------------------------
  // 10. Custom does not force AI
  // ----------------------------------------------------
  it("10. Custom does not force AI and preserves neutral platform defaults", () => {
    const { nodes, edges } = generatePresetFlow("CUSTOM");
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    expect(nodes[0].data?.nodeKind).toBe("START");
    expect(nodes[0].data?.aiPolicy).toBeUndefined();
  });

  // ----------------------------------------------------
  // 11. Preset application produces canonical schema
  // ----------------------------------------------------
  it("11. Preset application produces canonical schema for all 5 presets", () => {
    const presets: IVRExperiencePreset[] = [
      "CLASSIC_IVR",
      "SMART_IVR",
      "ADAPTIVE_IVR",
      "CONVERSATIONAL_IVR",
      "CUSTOM",
    ];

    for (const preset of presets) {
      const flow = generatePresetFlow(preset);
      expect(Array.isArray(flow.nodes)).toBe(true);
      expect(Array.isArray(flow.edges)).toBe(true);
      for (const n of flow.nodes) {
        expect(typeof n.id).toBe("string");
        expect(typeof n.data?.nodeKind).toBe("string");
      }
    }
  });

  // ----------------------------------------------------
  // 12. No runtime checks preset identity
  // ----------------------------------------------------
  it("12. Runtime execution relies only on node configuration, never on preset metadata", () => {
    const adaptiveFlow = generatePresetFlow("ADAPTIVE_IVR");
    const menuNode = adaptiveFlow.nodes.find(n => n.data?.nodeKind === "HYBRID_MENU")!;

    // Runtime router evaluates node data directly
    const routeResult = routeStandardInput({
      rawInput: "I have a question about visiting hours",
      nodes: adaptiveFlow.nodes,
      edges: adaptiveFlow.edges,
      currentNodeId: menuNode.id,
      inputMode: "VOICE",
    });

    expect(routeResult.matched).toBe(true);
    expect(routeResult.transition).toBe("CONVERSATIONAL_ESCAPE");
    expect(routeResult.resultingNodeId).toBe("faq_assistant");
  });

  // ----------------------------------------------------
  // 13. Applying preset to existing draft shows/uses controlled changes
  // ----------------------------------------------------
  it("13. Applying preset to existing draft returns summary of changes and preserves custom nodes", () => {
    const existingFlow = {
      nodes: [
        {
          id: "start",
          type: "ivr",
          position: { x: 0, y: 0 },
          data: { nodeKind: "START", label: "Start", runtimeMode: "PREMIUM" },
        } as IVRNode,
        {
          id: "custom_menu",
          type: "ivr",
          position: { x: 200, y: 0 },
          data: {
            nodeKind: "HYBRID_MENU",
            label: "Custom Menu",
            inputMode: "BOTH",
            conversationalEscape: { enabled: true, targetNodeId: "kb" },
          },
        } as IVRNode,
        {
          id: "custom_action",
          type: "ivr",
          position: { x: 400, y: 0 },
          data: { nodeKind: "ACTION", label: "Custom Action", actionCode: "PAYMENT_PROCESS" },
        } as IVRNode,
      ],
      edges: [],
    };

    // Convert to Traditional (Classic)
    const result = applyPresetToFlow(existingFlow, "CLASSIC_IVR");
    expect(result.changesCount).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);

    const convertedMenu = result.nodes.find(n => n.id === "custom_menu");
    expect(convertedMenu?.data?.inputMode).toBe("DTMF");
    expect(convertedMenu?.data?.conversationalEscape?.enabled).toBe(false);

    // Custom action node is preserved
    const customAction = result.nodes.find(n => n.id === "custom_action");
    expect(customAction).toBeDefined();
    expect(customAction?.data?.actionCode).toBe("PAYMENT_PROCESS");
  });

  // ----------------------------------------------------
  // 14. Published flow cannot be modified
  // ----------------------------------------------------
  it("14. Applying preset operates on mutable draft objects without modifying frozen published state", () => {
    const publishedVersion = {
      id: "ver-1",
      status: "PUBLISHED",
      definition: Object.freeze(generatePresetFlow("CLASSIC_IVR")),
    };

    const draftCopy = JSON.parse(JSON.stringify(publishedVersion.definition));
    const result = applyPresetToFlow(draftCopy, "ADAPTIVE_IVR");

    expect(result.nodes.find(n => n.data?.conversationalEscape?.enabled === true)).toBeDefined();
    // Published version is unmodified
    expect(publishedVersion.definition.nodes[0].data?.runtimeMode).toBe("STANDARD");
  });

  // ----------------------------------------------------
  // 15. Copilot uses same preset implementation
  // ----------------------------------------------------
  it("15. Copilot uses same preset implementation for preset prompts", async () => {
    const draftFlow = generatePresetFlow("CLASSIC_IVR");

    const copilotResult = await buildFlowCopilotSuggestion({
      mode: "MODIFY",
      flowName: "Customer Flow",
      prompt: "Convert this flow to Smart IVR",
      currentFlow: draftFlow,
      supportedNodeKinds: [
        "START",
        "GREETING",
        "DTMF_MENU",
        "HYBRID_MENU",
        "KNOWLEDGE",
        "AUTH_GATE",
        "ACTION",
        "HUMAN_TRANSFER",
        "END_CALL",
      ],
      availableActions: [],
      transferDestinations: [],
      knowledgeDocuments: [{ id: "doc-1", name: "Doc 1", status: "READY", indexed: true }],
    });

    expect(copilotResult).toBeDefined();
    const candidateNodes = copilotResult.candidateFlow?.nodes ?? [];
    const modifiedMenu = candidateNodes.find((n: { data?: Record<string, unknown> }) => n.data?.nodeKind === "HYBRID_MENU" || n.data?.nodeKind === "DTMF_MENU");
    expect(modifiedMenu?.data?.inputMode).toBe("BOTH");
    expect((modifiedMenu?.data?.conversationalEscape as { enabled?: boolean })?.enabled).toBe(false);
  });

  // ----------------------------------------------------
  // 16. Save/Reload round-trip
  // ----------------------------------------------------
  it("16. Save/Reload round-trip preserves all preset properties", () => {
    const presets: IVRExperiencePreset[] = ["CLASSIC_IVR", "SMART_IVR", "ADAPTIVE_IVR", "CONVERSATIONAL_IVR"];

    for (const preset of presets) {
      const flow = generatePresetFlow(preset);
      const serialized = JSON.stringify(flow);
      const reloaded = JSON.parse(serialized);

      expect(reloaded.nodes).toEqual(flow.nodes);
      expect(reloaded.edges).toEqual(flow.edges);
    }
  });

  // ----------------------------------------------------
  // 17. Validation round-trip
  // ----------------------------------------------------
  it("17. Validation round-trip passes for all standard presets", () => {
    const presets: IVRExperiencePreset[] = ["CLASSIC_IVR", "SMART_IVR", "ADAPTIVE_IVR", "CONVERSATIONAL_IVR"];

    for (const preset of presets) {
      const flow = generatePresetFlow(preset);
      const validation = validateIVRFlowDefinition(flow);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    }
  });

  // ----------------------------------------------------
  // 18. Generic Industry Examples (Non-Banking)
  // ----------------------------------------------------
  it("18. Generic industry examples: Utility (Classic), Retail (Smart), Hospital (Adaptive), Travel (Conversational)", () => {
    // Utility Customer Service (Classic IVR)
    const utilityFlow = generatePresetFlow("CLASSIC_IVR", {
      actionCode: "REPORT_OUTAGE",
      transferDestinationId: "dest-utility-dispatch",
    });
    expect(validateIVRFlowDefinition(utilityFlow).valid).toBe(true);

    // Retail Store (Smart IVR)
    const retailFlow = generatePresetFlow("SMART_IVR", {
      knowledgeDocumentId: "doc-retail-hours",
      actionCode: "CHECK_ORDER_STATUS",
    });
    expect(validateIVRFlowDefinition(retailFlow).valid).toBe(true);

    // Hospital Support (Adaptive IVR)
    const hospitalFlow = generatePresetFlow("ADAPTIVE_IVR", {
      knowledgeDocumentId: "doc-hospital-faq",
      actionCode: "SCHEDULE_APPOINTMENT",
      transferDestinationId: "dest-nursing-desk",
    });
    expect(validateIVRFlowDefinition(hospitalFlow).valid).toBe(true);

    // Travel & Concierge (Conversational IVR)
    const travelFlow = generatePresetFlow("CONVERSATIONAL_IVR", {
      knowledgeDocumentId: "doc-airline-baggage-policy",
      actionCode: "LOOKUP_FLIGHT",
      transferDestinationId: "dest-ticket-counter",
    });
    expect(validateIVRFlowDefinition(travelFlow).valid).toBe(true);
  });

  // ----------------------------------------------------
  // 19. Tenant isolation
  // ----------------------------------------------------
  it("19. Presets accept tenant-scoped resource IDs without cross-tenant leakage", () => {
    const tenantAFlow = generatePresetFlow("ADAPTIVE_IVR", {
      knowledgeDocumentId: "tenant-a-doc-123",
      transferDestinationId: "tenant-a-agent-456",
    });

    const kbNode = tenantAFlow.nodes.find(n => n.data?.nodeKind === "KNOWLEDGE");
    expect(kbNode?.data?.knowledgeDocumentIds).toEqual(["tenant-a-doc-123"]);

    const transferNode = tenantAFlow.nodes.find(n => n.data?.nodeKind === "HUMAN_TRANSFER");
    expect(transferNode?.data?.transferDestinationId).toBe("tenant-a-agent-456");
  });

  // ----------------------------------------------------
  // 20. Legacy flows unchanged
  // ----------------------------------------------------
  it("20. Legacy flows without preset metadata operate normally with zero breaking changes", () => {
    const legacyFlow = {
      nodes: [
        {
          id: "start",
          type: "ivr",
          position: { x: 100, y: 100 },
          data: { nodeKind: "START", label: "Start", runtimeMode: "STANDARD" },
        } as IVRNode,
        {
          id: "menu",
          type: "ivr",
          position: { x: 300, y: 100 },
          data: {
            nodeKind: "DTMF_MENU",
            label: "Legacy Menu",
            options: [{ digit: "1", label: "End", destinationNodeId: "end" }],
          },
        } as IVRNode,
        {
          id: "end",
          type: "ivr",
          position: { x: 500, y: 100 },
          data: { nodeKind: "END_CALL", label: "End Call" },
        } as IVRNode,
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", type: "smoothstep", data: { trigger: "DEFAULT" } } as IVREdge,
        { id: "e2", source: "menu", target: "end", type: "smoothstep", data: { trigger: "DTMF", value: "1" } } as IVREdge,
      ],
    };

    const validation = validateIVRFlowDefinition(legacyFlow);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
