import { describe, expect, it } from "vitest";

import type { IVREdge, IVRNode } from "@/components/ivr/types";
import { buildFlowCopilotSuggestion } from "@/services/ivr/flow-copilot.service";
import {
  normalizeAIPolicy,
  normalizeConversationalEscapeConfig,
  normalizeNavigationConfig,
  normalizePostActionConfig,
} from "@/services/ivr/ivr-runtime-menu.service";
import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";
import { routeStandardInput } from "@/services/ivr/standard-input-router.service";

describe("Phase 5.5: Builder Completeness, UI Alignment & Copilot Parity", () => {
  // ----------------------------------------------------
  // 1. Phase 1 Navigation Round-Trip
  // ----------------------------------------------------
  it("Phase 1: Navigation configuration round-trips and normalizes correctly", () => {
    const rawData = {
      logicalRootMenuNodeId: "main_menu",
      navigation: {
        home: { enabled: true, digits: ["0", "5"], phrases: ["main menu", "start over"], targetNodeId: "main_menu" },
        back: { enabled: true, digits: ["*"], phrases: ["go back", "previous"] },
        repeat: { enabled: true, digits: ["#"], phrases: ["repeat", "say again"] },
        end: { enabled: true, digits: ["9"], phrases: ["goodbye", "end call"] },
      },
    };

    const normalized = normalizeNavigationConfig(rawData);
    expect(normalized).not.toBeNull();
    expect(normalized?.home?.enabled).toBe(true);
    expect(normalized?.home?.digits).toEqual(["0", "5"]);
    expect(normalized?.home?.phrases).toEqual(["main menu", "start over"]);
    expect(normalized?.home?.targetNodeId).toBe("main_menu");
    expect(normalized?.back?.digits).toEqual(["*"]);
    expect(normalized?.repeat?.digits).toEqual(["#"]);
    expect(normalized?.end?.digits).toEqual(["9"]);
  });

  // ----------------------------------------------------
  // 2. Phase 2 Post-Action Round-Trip
  // ----------------------------------------------------
  it("Phase 2: Post-action configuration round-trips for all supported modes", () => {
    const modes = [
      "RETURN_HOME",
      "RETURN_PREVIOUS",
      "STAY_CURRENT",
      "ASK_NEXT_ACTION",
      "CONTINUE_TO_NODE",
      "END_CALL",
    ] as const;

    for (const mode of modes) {
      const rawData = {
        postAction: {
          mode,
          targetNodeId: mode === "CONTINUE_TO_NODE" ? "target_node" : undefined,
          prompt: mode === "ASK_NEXT_ACTION" ? "What would you like to do next?" : undefined,
        },
      };

      const normalized = normalizePostActionConfig(rawData);
      expect(normalized?.mode).toBe(mode);
      if (mode === "CONTINUE_TO_NODE") {
        expect(normalized?.targetNodeId).toBe("target_node");
      }
      if (mode === "ASK_NEXT_ACTION") {
        expect(normalized?.prompt).toBe("What would you like to do next?");
      }
    }
  });

  // ----------------------------------------------------
  // 3. Phase 4 AI Policy Round-Trip
  // ----------------------------------------------------
  it("Phase 4: AI Policy configuration round-trips with normalized confidence semantics", () => {
    const modes = ["NEVER", "FREE_FORM_ONLY", "LOW_CONFIDENCE_ONLY", "ALWAYS_CONVERSATIONAL"] as const;

    for (const mode of modes) {
      const rawData = {
        aiPolicy: {
          mode,
          timeoutMs: 6000,
          failureBehavior: "LOCAL_KB",
          confidenceThreshold: 0.75,
          allowRerank: true,
        },
      };

      const normalized = normalizeAIPolicy(rawData);
      expect(normalized?.mode).toBe(mode);
      expect(normalized?.timeoutMs).toBe(6000);
      expect(normalized?.failureBehavior).toBe("LOCAL_KB");
      expect(normalized?.confidenceThreshold).toBe(0.75);
    }
  });

  // ----------------------------------------------------
  // 4. Phase 5 Conversational Escape Round-Trip
  // ----------------------------------------------------
  it("Phase 5: Conversational Escape configuration round-trips and preserves side-turn settings", () => {
    const rawData = {
      conversationalEscape: {
        enabled: true,
        targetNodeId: "faq_assistant",
        returnBehavior: "RETURN_CONTEXT",
        prompt: "Let me check that information for you.",
      },
    };

    const normalized = normalizeConversationalEscapeConfig(rawData);
    expect(normalized?.enabled).toBe(true);
    expect(normalized?.targetNodeId).toBe("faq_assistant");
    expect(normalized?.returnBehavior).toBe("RETURN_CONTEXT");
    expect(normalized?.prompt).toBe("Let me check that information for you.");
  });

  // ----------------------------------------------------
  // 5. Classic Zero-AI IVR (No AI Required)
  // ----------------------------------------------------
  it("Classic IVR requires zero AI and passes validation", () => {
    const classicFlow: { nodes: IVRNode[]; edges: IVREdge[] } = {
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start" } },
        { id: "greeting", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "GREETING", label: "Greeting", prompt: "Welcome to our helpline." } },
        {
          id: "menu",
          type: "ivr",
          position: { x: 400, y: 0 },
          data: {
            nodeKind: "DTMF_MENU",
            label: "Main Menu",
            prompt: "Press 1 for Support, 9 to End.",
            options: [
              { digit: "1", action: "CUSTOM", label: "Support", destinationNodeId: "auth_gate" },
              { digit: "9", action: "END_CALL", label: "End", destinationNodeId: "end" },
            ],
            conversationalEscape: { enabled: false },
          },
        },
        { id: "auth_gate", type: "ivr", position: { x: 600, y: 0 }, data: { nodeKind: "AUTH_GATE", label: "Auth Gate", requiredAuthLevel: "AUTH_LEVEL_1" } },
        { id: "transfer_support", type: "ivr", position: { x: 800, y: -100 }, data: { nodeKind: "HUMAN_TRANSFER", label: "Support Transfer", transferDestinationId: "dest-support" } },
        { id: "end", type: "ivr", position: { x: 1000, y: 0 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Goodbye." } },
      ],
      edges: [
        { id: "e1", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
        { id: "e2", source: "greeting", target: "menu", data: { trigger: "DEFAULT" } },
        { id: "e3", source: "menu", target: "auth_gate", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { id: "e4", source: "menu", target: "end", sourceHandle: "9", data: { trigger: "DTMF", value: "9" } },
        { id: "e5", source: "auth_gate", target: "transfer_support", data: { trigger: "AUTHENTICATED" } },
        { id: "e6", source: "auth_gate", target: "end", data: { trigger: "NOT_AUTHENTICATED" } },
        { id: "e7", source: "transfer_support", target: "end", data: { trigger: "HUMAN_TRANSFER" } },
        { id: "e8", source: "transfer_support", target: "end", data: { trigger: "ACTION_FAILURE" } },
      ],
    };

    const validation = validateIVRFlowDefinition({
      nodes: classicFlow.nodes,
      edges: classicFlow.edges,
      allowedTransferDestinationIds: ["dest-support"],
      allowedAuthenticationLevels: ["AUTH_LEVEL_1"],
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 6. Smart IVR (DTMF + Speech Aliases, AI NEVER)
  // ----------------------------------------------------
  it("Smart IVR with speech aliases and local knowledge passes validation with AI disabled (NEVER)", () => {
    const smartFlow: { nodes: IVRNode[]; edges: IVREdge[] } = {
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start" } },
        {
          id: "menu",
          type: "ivr",
          position: { x: 300, y: 0 },
          data: {
            nodeKind: "HYBRID_MENU",
            label: "Main Menu",
            prompt: "Press or say 1 for Hours, 2 for Support.",
            options: [
              { digit: "1", action: "CUSTOM", label: "Hours", voicePhrases: ["hours", "timings", "opening hours"], destinationNodeId: "kb_hours" },
              { digit: "2", action: "END_CALL", label: "Support", voicePhrases: ["support", "help"], destinationNodeId: "end" },
            ],
            conversationalEscape: { enabled: false },
          },
        },
        {
          id: "kb_hours",
          type: "ivr",
          position: { x: 600, y: 0 },
          data: {
            nodeKind: "KNOWLEDGE",
            label: "Hours FAQ",
            knowledgeDocumentIds: ["doc-hours"],
            aiPolicy: { mode: "NEVER" },
            postAction: { mode: "RETURN_PREVIOUS" },
          },
        },
        { id: "end", type: "ivr", position: { x: 900, y: 0 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Thank you. Goodbye." } },
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { id: "e2", source: "menu", target: "kb_hours", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { id: "e3", source: "menu", target: "end", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { id: "e4", source: "kb_hours", target: "menu", data: { trigger: "KNOWLEDGE_FOUND" } },
      ],
    };

    const validation = validateIVRFlowDefinition({
      nodes: smartFlow.nodes,
      edges: smartFlow.edges,
      allowedKnowledgeDocumentIds: ["doc-hours"],
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 7. Adaptive IVR (Menu + Conversational Escape + FREE_FORM_ONLY)
  // ----------------------------------------------------
  it("Adaptive IVR with Conversational Escape and FREE_FORM_ONLY validates cleanly", () => {
    const adaptiveFlow: { nodes: IVRNode[]; edges: IVREdge[] } = {
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start" } },
        {
          id: "menu",
          type: "ivr",
          position: { x: 300, y: 0 },
          data: {
            nodeKind: "HYBRID_MENU",
            label: "Main Menu",
            prompt: "Press or say 1 for Billing, 2 for Technical Support.",
            options: [
              { digit: "1", action: "END_CALL", label: "Billing", voicePhrases: ["billing", "pay bill"], destinationNodeId: "end" },
              { digit: "2", action: "END_CALL", label: "Support", voicePhrases: ["technical support", "tech support"], destinationNodeId: "end" },
            ],
            conversationalEscape: {
              enabled: true,
              targetNodeId: "faq_assistant",
              returnBehavior: "RETURN_CONTEXT",
              prompt: "I can help with general questions.",
            },
          },
        },
        {
          id: "faq_assistant",
          type: "ivr",
          position: { x: 600, y: 150 },
          data: {
            nodeKind: "KNOWLEDGE",
            label: "FAQ Assistant",
            knowledgeDocumentIds: ["doc-faq"],
            aiPolicy: { mode: "FREE_FORM_ONLY", timeoutMs: 8000, failureBehavior: "LOCAL_KB" },
          },
        },
        { id: "end", type: "ivr", position: { x: 600, y: -100 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Goodbye." } },
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { id: "e2", source: "menu", target: "end", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { id: "e3", source: "menu", target: "end", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { id: "e4", source: "menu", target: "faq_assistant", data: { trigger: "DEFAULT" } },
        { id: "e5", source: "faq_assistant", target: "menu", data: { trigger: "KNOWLEDGE_FOUND" } },
      ],
    };

    const validation = validateIVRFlowDefinition({
      nodes: adaptiveFlow.nodes,
      edges: adaptiveFlow.edges,
      allowedKnowledgeDocumentIds: ["doc-faq"],
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ----------------------------------------------------
  // 8. Generic Non-Banking Hospital Flow
  // ----------------------------------------------------
  it("Generic Hospital Flow with Appointments, Lab, Billing, Nav shortcuts, and Escape functions end-to-end", () => {
    const hospitalFlow: { nodes: IVRNode[]; edges: IVREdge[] } = {
      nodes: [
        {
          id: "start",
          type: "ivr",
          position: { x: 0, y: 0 },
          data: {
            nodeKind: "START",
            label: "Start",
            logicalRootMenuNodeId: "hospital_menu",
            navigation: {
              home: { enabled: true, digits: ["5"], phrases: ["hospital menu", "main menu"] },
              back: { enabled: true, digits: ["6"], phrases: ["go back", "previous menu"] },
              repeat: { enabled: true, digits: ["7"], phrases: ["repeat options", "say again"] },
              end: { enabled: true, digits: ["9"], phrases: ["goodbye", "end call"] },
            },
          },
        },
        {
          id: "hospital_menu",
          type: "ivr",
          position: { x: 300, y: 0 },
          data: {
            nodeKind: "HYBRID_MENU",
            label: "Hospital Main Menu",
            prompt: "Welcome to City General Hospital. Press or say 1 for Appointments, 2 for Lab Results, 3 for Billing. Or ask any general question.",
            options: [
              { digit: "1", action: "CUSTOM", label: "Appointments", voicePhrases: ["appointments", "doctor appointment", "book appointment"], destinationNodeId: "auth_gate" },
              { digit: "2", action: "CUSTOM", label: "Lab Results", voicePhrases: ["lab", "lab results", "test report"], destinationNodeId: "auth_gate" },
              { digit: "3", action: "CUSTOM", label: "Billing", voicePhrases: ["billing", "hospital bill", "payment"], destinationNodeId: "auth_gate" },
              { digit: "9", action: "END_CALL", label: "End Call", destinationNodeId: "end_call" },
            ],
            conversationalEscape: {
              enabled: true,
              targetNodeId: "hospital_faq",
              returnBehavior: "RETURN_CONTEXT",
              prompt: "Let me check our hospital information for you.",
            },
          },
        },
        { id: "auth_gate", type: "ivr", position: { x: 500, y: 0 }, data: { nodeKind: "AUTH_GATE", label: "Auth Gate", requiredAuthLevel: "AUTH_LEVEL_1" } },
        { id: "action_appointments", type: "ivr", position: { x: 750, y: -150 }, data: { nodeKind: "ACTION", label: "Appointments Service", actionCode: "CUSTOM", postAction: { mode: "RETURN_HOME" } } },
        { id: "action_lab", type: "ivr", position: { x: 750, y: 0 }, data: { nodeKind: "ACTION", label: "Lab Service", actionCode: "CUSTOM", postAction: { mode: "RETURN_PREVIOUS" } } },
        { id: "action_billing", type: "ivr", position: { x: 750, y: 150 }, data: { nodeKind: "ACTION", label: "Billing Service", actionCode: "CUSTOM", postAction: { mode: "RETURN_HOME" } } },
        {
          id: "hospital_faq",
          type: "ivr",
          position: { x: 750, y: 300 },
          data: {
            nodeKind: "KNOWLEDGE",
            label: "Hospital FAQ",
            knowledgeDocumentIds: ["doc-hospital-info"],
            aiPolicy: { mode: "FREE_FORM_ONLY", timeoutMs: 7000, failureBehavior: "LOCAL_KB" },
          },
        },
        { id: "end_call", type: "ivr", position: { x: 1050, y: 0 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Thank you for contacting City General Hospital. Take care." } },
      ],
      edges: [
        { id: "e1", source: "start", target: "hospital_menu", data: { trigger: "DEFAULT" } },
        { id: "e2", source: "hospital_menu", target: "auth_gate", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { id: "e3", source: "hospital_menu", target: "auth_gate", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { id: "e4", source: "hospital_menu", target: "auth_gate", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
        { id: "e5", source: "hospital_menu", target: "end_call", sourceHandle: "9", data: { trigger: "DTMF", value: "9" } },
        { id: "e6", source: "hospital_menu", target: "hospital_faq", data: { trigger: "DEFAULT" } },
        { id: "e7", source: "auth_gate", target: "action_appointments", data: { trigger: "AUTHENTICATED" } },
        { id: "e8", source: "auth_gate", target: "action_lab", data: { trigger: "AUTHENTICATED" } },
        { id: "e9", source: "auth_gate", target: "action_billing", data: { trigger: "AUTHENTICATED" } },
        { id: "e10", source: "auth_gate", target: "end_call", data: { trigger: "NOT_AUTHENTICATED" } },
        { id: "e11", source: "action_appointments", target: "end_call", data: { trigger: "ACTION_SUCCESS" } },
        { id: "e12", source: "action_lab", target: "end_call", data: { trigger: "ACTION_SUCCESS" } },
        { id: "e13", source: "action_billing", target: "end_call", data: { trigger: "ACTION_SUCCESS" } },
        { id: "e14", source: "hospital_faq", target: "end_call", data: { trigger: "KNOWLEDGE_FOUND" } },
      ],
    };

    const validation = validateIVRFlowDefinition({
      nodes: hospitalFlow.nodes,
      edges: hospitalFlow.edges,
      allowedKnowledgeDocumentIds: ["doc-hospital-info"],
      allowedActionCodes: ["CUSTOM"],
      allowedAuthenticationLevels: ["AUTH_LEVEL_1"],
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Test routing inside Hospital Flow:
    // A: DTMF digit 1 -> auth_gate
    const route1 = routeStandardInput({
      nodes: hospitalFlow.nodes as never,
      edges: hospitalFlow.edges as never,
      currentNodeId: "hospital_menu",
      inputMode: "DTMF",
      rawInput: "1",
    });
    expect(route1.matched).toBe(true);
    expect(route1.resultingNodeId).toBe("auth_gate");

    // B: Speech alias "doctor appointment" -> auth_gate
    const routeVoice = routeStandardInput({
      nodes: hospitalFlow.nodes as never,
      edges: hospitalFlow.edges as never,
      currentNodeId: "hospital_menu",
      inputMode: "VOICE",
      rawInput: "I want to book a doctor appointment",
    });
    expect(routeVoice.matched).toBe(true);
    expect(routeVoice.resultingNodeId).toBe("auth_gate");

    // C: Semantic navigation HOME (digit 5 or phrase) -> Main Menu
    const routeHome = routeStandardInput({
      nodes: hospitalFlow.nodes as never,
      edges: hospitalFlow.edges as never,
      currentNodeId: "hospital_menu",
      inputMode: "VOICE",
      rawInput: "hospital menu",
    });
    expect(routeHome.matched).toBe(true);
    expect(routeHome.transition).toBe("HOME");

    // D: Conversational Escape: "What time are you open on Sunday?" -> Hospital FAQ
    const routeEscape = routeStandardInput({
      nodes: hospitalFlow.nodes as never,
      edges: hospitalFlow.edges as never,
      currentNodeId: "hospital_menu",
      inputMode: "VOICE",
      rawInput: "What time are you open on Sunday?",
    });
    expect(routeEscape.matched).toBe(true);
    expect(routeEscape.resultingNodeId).toBe("hospital_faq");
    expect(routeEscape.transition).toBe("CONVERSATIONAL_ESCAPE");
  });

  // ----------------------------------------------------
  // 9. Copilot Parity & Draft Schema Safety
  // ----------------------------------------------------
  it("Copilot modifies canonical schema for Phase 1-5 prompts without touching published state", async () => {
    const baseFlow: { nodes: IVRNode[]; edges: IVREdge[] } = {
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: "Start" } },
        {
          id: "menu",
          type: "ivr",
          position: { x: 300, y: 0 },
          data: {
            nodeKind: "HYBRID_MENU",
            label: "Main Menu",
            options: [
              { digit: "1", action: "CUSTOM", label: "Support", voicePhrases: ["help"], destinationNodeId: "knowledge" },
            ],
          },
        },
        {
          id: "knowledge",
          type: "ivr",
          position: { x: 600, y: 0 },
          data: {
            nodeKind: "KNOWLEDGE",
            label: "Eligibility Knowledge",
            knowledgeDocumentIds: ["doc-1"],
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { id: "e2", source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
      ],
    };

    const context = {
      mode: "MODIFY" as const,
      flowName: "Test Flow",
      currentFlow: baseFlow,
      supportedNodeKinds: ["START", "HYBRID_MENU", "KNOWLEDGE", "END_CALL"],
      availableActions: [],
      transferDestinations: [],
      knowledgeDocuments: [{ id: "doc-1", name: "Doc 1", status: "READY", indexed: true }],
    };

    // Instruction 1: Traditional IVR with no AI
    const resNoAi = await buildFlowCopilotSuggestion({ ...context, prompt: "Make this a traditional IVR with no AI." });
    expect(resNoAi.candidateFlow?.nodes.some((n: { data?: Record<string, unknown> }) => (n.data?.aiPolicy as { mode?: string })?.mode === "NEVER")).toBe(true);

    // Instruction 2: Add voice phrase to support
    const resSupport = await buildFlowCopilotSuggestion({ ...context, prompt: "Allow callers to say support." });
    const menuNode = resSupport.candidateFlow?.nodes.find((n: { id: string }) => n.id === "menu");
    const options = (menuNode?.data as Record<string, unknown>)?.options as Array<Record<string, unknown>>;
    expect(options[0]?.voicePhrases).toContain("support");

    // Instruction 3: Return to previous menu after eligibility
    const resPost = await buildFlowCopilotSuggestion({ ...context, prompt: "After eligibility return to the previous menu." });
    const kbNode = resPost.candidateFlow?.nodes.find((n: { id: string }) => n.id === "knowledge");
    expect(((kbNode?.data as Record<string, unknown>)?.postAction as { mode?: string })?.mode).toBe("RETURN_PREVIOUS");

    // Instruction 4: Enable AI only for caller questions
    const resFreeForm = await buildFlowCopilotSuggestion({ ...context, prompt: "Enable AI only for caller questions." });
    const kbNode2 = resFreeForm.candidateFlow?.nodes.find((n: { id: string }) => n.id === "knowledge");
    expect(((kbNode2?.data as Record<string, unknown>)?.aiPolicy as { mode?: string })?.mode).toBe("FREE_FORM_ONLY");

    // Instruction 5: Conversational Escape from menu
    const resEscape = await buildFlowCopilotSuggestion({ ...context, prompt: "Let callers ask questions from this menu and return here afterwards." });
    const menuNode2 = resEscape.candidateFlow?.nodes.find((n: { id: string }) => n.id === "menu");
    expect(((menuNode2?.data as Record<string, unknown>)?.conversationalEscape as { enabled?: boolean })?.enabled).toBe(true);
    expect(((menuNode2?.data as Record<string, unknown>)?.conversationalEscape as { returnBehavior?: string })?.returnBehavior).toBe("RETURN_CONTEXT");

    // Instruction 6: Change Home to digit 5
    const resHome = await buildFlowCopilotSuggestion({ ...context, prompt: "Change Home to digit 5." });
    const startNode = resHome.candidateFlow?.nodes.find((n: { id: string }) => n.id === "start");
    expect(((startNode?.data as Record<string, unknown>)?.navigation as { home?: { digits?: string[] } })?.home?.digits).toEqual(["5"]);
  });
});
