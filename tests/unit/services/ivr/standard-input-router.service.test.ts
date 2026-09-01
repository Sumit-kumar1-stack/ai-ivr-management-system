import { describe, expect, it } from "vitest";
import { routeStandardInput } from "@/services/ivr/standard-input-router.service";

const flow = {
  nodes: [
    { id: "start", data: { nodeKind: "START" } },
    { id: "menu", data: { nodeKind: "HYBRID_MENU", allowNaturalLanguageEscape: true, escapeNodeId: "knowledge", options: [{ label: "Personal loan", digit: "1", voicePhrases: ["personal loan", "apply for personal loan"], destinationNodeId: "knowledge" }] } },
    { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
  ],
  edges: [{ source: "menu", target: "knowledge", data: { trigger: "MENU_OPTION", value: "1" } }],
};

describe("StandardInputRouter", () => {
  it("routes equivalent DTMF and configured voice to the same node", () => {
    const digit = routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "DTMF", rawInput: "1" });
    const voice = routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "loan" });
    expect(digit.resultingNodeId).toBe("knowledge");
    expect(voice.resultingNodeId).toBe(digit.resultingNodeId);
  });

  it("reads a legacy dtmf field without changing the canonical digit route", () => {
    const result = routeStandardInput({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [{ label: "Personal loan", dtmf: "1", destinationNodeId: "knowledge" }] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [{ source: "menu", target: "knowledge", data: { trigger: "DTMF", value: "1" } }],
      currentNodeId: "menu",
      inputMode: "DTMF",
      rawInput: "1",
    });

    expect(result).toMatchObject({ matched: true, resultingNodeId: "knowledge" });
  });

  it("reads a saved menuOptions alias while canonical drafts use options", () => {
    const result = routeStandardInput({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", menuOptions: [{ label: "Personal loan", digit: "1", voicePhrases: ["loan"], destinationNodeId: "knowledge" }] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [{ source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } }],
      currentNodeId: "menu",
      inputMode: "VOICE",
      rawInput: "loan",
    });

    expect(result).toMatchObject({ matched: true, resultingNodeId: "knowledge" });
  });

  it("returns clarification for an invalid or ambiguous input", () => {
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "DTMF", rawInput: "9" }).action).toBe("CLARIFY");
  });

  it("escapes a spoken question to the configured node when natural language escape is enabled", () => {
    const result = routeStandardInput({
      ...flow,
      currentNodeId: "menu",
      inputMode: "VOICE",
      rawInput: "What documents do I need for a home loan?",
    });

    expect(result).toMatchObject({
      matched: true,
      action: "NAVIGATE",
      resultingNodeId: "knowledge",
      transition: "NATURAL_LANGUAGE_ESCAPE",
    });
  });

  it("routes multiple DTMF digits and their configured voice phrases to one Knowledge node", () => {
    const sharedKnowledgeFlow = {
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", allowNaturalLanguageEscape: true, escapeNodeId: "knowledge", options: [
          { label: "Loan information", digit: "1", voicePhrases: ["loan information"], destinationNodeId: "knowledge" },
          { label: "Eligibility", digit: "2", voicePhrases: ["eligibility"], destinationNodeId: "knowledge" },
          { label: "Documents", digit: "3", voicePhrases: ["documents"], destinationNodeId: "knowledge" },
        ] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [
        { source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { source: "menu", target: "knowledge", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { source: "menu", target: "knowledge", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
      ],
    };

    for (const [digit, phrase] of [["1", "loan information"], ["2", "eligibility"], ["3", "documents"]]) {
      expect(routeStandardInput({ ...sharedKnowledgeFlow, currentNodeId: "menu", inputMode: "DTMF", rawInput: digit }).resultingNodeId).toBe("knowledge");
      expect(routeStandardInput({ ...sharedKnowledgeFlow, currentNodeId: "menu", inputMode: "VOICE", rawInput: phrase }).resultingNodeId).toBe("knowledge");
    }
  });

  it("supports repeat, go back, and main menu navigation commands", () => {
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "repeat" }).action).toBe("REPEAT");
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "back", previousNodeId: "start" }).resultingNodeId).toBe("start");
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "main menu" }).resultingNodeId).toBe("start");
  });

  describe("Phase 1: Adaptive Global Navigation", () => {
    const navFlow = {
      nodes: [
        {
          id: "start",
          data: {
            nodeKind: "START",
            mainMenuNodeId: "root_menu",
            navigation: {
              home: { enabled: true, digits: ["5"], phrases: ["home please", "main menu"], targetNodeId: "root_menu" },
              back: { enabled: true, digits: ["6"], phrases: ["previous", "go back"] },
              repeat: { enabled: true, digits: ["7"], phrases: ["repeat please"] },
              end: { enabled: true, digits: ["4"], phrases: ["goodbye call"] },
            },
          },
        },
        {
          id: "root_menu",
          data: {
            nodeKind: "HYBRID_MENU",
            options: [{ label: "Services", digit: "1", phrases: ["services"], destinationNodeId: "sub_menu" }],
          },
        },
        {
          id: "sub_menu",
          data: {
            nodeKind: "HYBRID_MENU",
            options: [
              { label: "Option 5", digit: "5", phrases: ["option five"], destinationNodeId: "opt5_dest" },
              { label: "Option 2", digit: "2", phrases: ["option two"], destinationNodeId: "opt2_dest" },
            ],
          },
        },
        { id: "opt5_dest", data: { nodeKind: "KNOWLEDGE" } },
        { id: "opt2_dest", data: { nodeKind: "KNOWLEDGE" } },
        { id: "end_node", data: { nodeKind: "END_CALL" } },
      ],
      edges: [],
    };

    it("routes configured HOME digit and phrase to root_menu (not blindly START)", () => {
      const dtmfRes = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "4" });
      expect(dtmfRes).toMatchObject({ matched: true, action: "NAVIGATE", transition: "END_CALL", resultingNodeId: "end_node" });

      const homeVoice = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "VOICE", rawInput: "home please" });
      expect(homeVoice).toMatchObject({ matched: true, action: "MAIN_MENU", transition: "HOME", resultingNodeId: "root_menu" });
    });

    it("current-menu configured option takes precedence over navigation digit collision", () => {
      // sub_menu has option digit "5" -> opt5_dest, and HOME also uses digit "5"
      const res = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "5" });
      expect(res).toMatchObject({ matched: true, action: "NAVIGATE", resultingNodeId: "opt5_dest" });
    });

    it("routes configured BACK digit and phrase to valid previousNodeId", () => {
      const dtmfBack = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "6", previousNodeId: "root_menu" });
      expect(dtmfBack).toMatchObject({ matched: true, action: "GO_BACK", resultingNodeId: "root_menu" });

      const voiceBack = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "VOICE", rawInput: "previous", previousNodeId: "root_menu" });
      expect(voiceBack).toMatchObject({ matched: true, action: "GO_BACK", resultingNodeId: "root_menu" });
    });

    it("fails safely when previousNodeId is invalid/missing on BACK", () => {
      const dtmfBackInvalid = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "6", previousNodeId: "non_existent_node" });
      // Falls back to configured HOME/mainMenuNodeId ("root_menu")
      expect(dtmfBackInvalid).toMatchObject({ matched: true, action: "GO_BACK", resultingNodeId: "root_menu" });
    });

    it("does not accept arbitrary digits 0 or * as magic hardcoded navigation", () => {
      const res0 = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "0" });
      expect(res0.matched).toBe(false);

      const resStar = routeStandardInput({ ...navFlow, currentNodeId: "sub_menu", inputMode: "DTMF", rawInput: "*" });
      expect(resStar.matched).toBe(false);
    });

    it("does not accept disabled navigation commands", () => {
      const disabledNavFlow = {
        nodes: [
          {
            id: "start",
            data: {
              nodeKind: "START",
              navigation: {
                home: { enabled: false, digits: ["0"], phrases: ["main menu"] },
                back: { enabled: false, digits: ["*"], phrases: ["go back"] },
              },
            },
          },
          { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [] } },
        ],
        edges: [],
      };

      const dtmfHome = routeStandardInput({ ...disabledNavFlow, currentNodeId: "menu", inputMode: "DTMF", rawInput: "0" });
      expect(dtmfHome.matched).toBe(false);

      const voiceHome = routeStandardInput({ ...disabledNavFlow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "main menu" });
      expect(voiceHome.matched).toBe(false);
    });
  });

  describe("Phase 5: Conversational Escape & Input Precedence", () => {
    const escapeFlow = {
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        {
          id: "main_menu",
          data: {
            nodeKind: "HYBRID_MENU",
            options: [
              { digit: "1", label: "Sales", voicePhrases: ["sales", "buy"], destinationNodeId: "sales_node" },
              { digit: "2", label: "Support", voicePhrases: ["support", "help desk"], destinationNodeId: "support_node" },
            ],
            conversationalEscape: {
              enabled: true,
              targetNodeId: "faq_assistant",
              returnBehavior: "RETURN_CONTEXT",
            },
          },
        },
        { id: "sales_node", data: { nodeKind: "ACTION" } },
        { id: "support_node", data: { nodeKind: "ACTION" } },
        { id: "faq_assistant", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [
        { source: "start", target: "main_menu" },
        { source: "main_menu", target: "sales_node" },
        { source: "main_menu", target: "support_node" },
        { source: "main_menu", target: "faq_assistant" },
      ],
    };

    it("configured menu alias wins over Conversational Escape (deterministic first)", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "support",
      });

      expect(route.matched).toBe(true);
      expect(route.resultingNodeId).toBe("support_node");
      expect(route.transition).toBe("MENU_OPTION");
    });

    it("fuzzy deterministic menu match beats Conversational Escape", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "I need help desk right now",
      });

      expect(route.matched).toBe(true);
      expect(route.resultingNodeId).toBe("support_node");
      expect(route.transition).toBe("MENU_OPTION");
    });

    it("semantic HOME beats Conversational Escape", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "main menu",
      });

      expect(route.matched).toBe(true);
      expect(route.transition).toBe("MAIN_MENU");
      expect(route.action).toBe("MAIN_MENU");
    });

    it("semantic BACK beats Conversational Escape", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        previousNodeId: "start",
        navigationHistory: ["start"],
        inputMode: "VOICE",
        rawInput: "go back",
      });

      expect(route.matched).toBe(true);
      expect(route.transition).toBe("GO_BACK");
      expect(route.action).toBe("GO_BACK");
    });

    it("semantic REPEAT beats Conversational Escape", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "repeat",
      });

      expect(route.matched).toBe(true);
      expect(route.transition).toBe("REPEAT");
      expect(route.action).toBe("REPEAT");
    });

    it("semantic END beats Conversational Escape", () => {
      const flowWithEnd = {
        ...escapeFlow,
        nodes: [
          ...escapeFlow.nodes,
          { id: "end_node", data: { nodeKind: "END_CALL" } },
        ],
        nodes_with_nav: [
          {
            id: "start",
            data: {
              nodeKind: "START",
              navigation: { end: { enabled: true, phrases: ["end call", "hang up"] } },
            },
          },
        ],
      };

      const route = routeStandardInput({
        nodes: [
          { id: "start", data: { nodeKind: "START", navigation: { end: { enabled: true, phrases: ["end call", "hang up"] } } } },
          ...escapeFlow.nodes.filter(n => n.id !== "start"),
          { id: "end_node", data: { nodeKind: "END_CALL" } },
        ],
        edges: escapeFlow.edges,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "end call",
      });

      expect(route.matched).toBe(true);
      expect(route.transition).toBe("END_CALL");
      expect(route.resultingNodeId).toBe("end_node");
    });

    it("configured DTMF digit option wins over Conversational Escape (zero AI)", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "DTMF",
        rawInput: "1",
      });

      expect(route.matched).toBe(true);
      expect(route.resultingNodeId).toBe("sales_node");
      expect(route.transition).toBe("MENU_OPTION");
    });

    it("unknown DTMF digit never triggers Conversational Escape", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "DTMF",
        rawInput: "9",
      });

      expect(route.matched).toBe(false);
      expect(route.action).toBe("CLARIFY");
    });

    it("fillers like 'uh', 'hmm', 'ok' do not escape", () => {
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "uh" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "hmm" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "ok" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "no" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "hey" }).matched).toBe(false);
    });

    it("provider noise and meaningless single tokens do not escape", () => {
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "[noise]" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "<silence>" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "xyz" }).matched).toBe(false);
      expect(routeStandardInput({ ...escapeFlow, currentNodeId: "main_menu", inputMode: "VOICE", rawInput: "asdf" }).matched).toBe(false);
    });

    it("genuine question does escape: 'What are your opening hours on Sunday?'", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "What are your opening hours on Sunday?",
      });

      expect(route.matched).toBe(true);
      expect(route.resultingNodeId).toBe("faq_assistant");
      expect(route.transition).toBe("CONVERSATIONAL_ESCAPE");
    });

    it("legitimate conversational statement can escape: 'I need information about weekend opening hours'", () => {
      const route = routeStandardInput({
        ...escapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "I need information about weekend opening hours",
      });

      expect(route.matched).toBe(true);
      expect(route.resultingNodeId).toBe("faq_assistant");
      expect(route.transition).toBe("CONVERSATIONAL_ESCAPE");
    });

    it("disabled Conversational Escape returns clarify/unmatched for unknown speech", () => {
      const disabledEscapeFlow = {
        ...escapeFlow,
        nodes: [
          ...escapeFlow.nodes.filter(n => n.id !== "main_menu"),
          {
            id: "main_menu",
            data: {
              nodeKind: "HYBRID_MENU",
              options: [{ digit: "1", label: "Sales", voicePhrases: ["sales"], destinationNodeId: "sales_node" }],
              conversationalEscape: { enabled: false },
            },
          },
        ],
      };

      const route = routeStandardInput({
        ...disabledEscapeFlow,
        currentNodeId: "main_menu",
        inputMode: "VOICE",
        rawInput: "Can you tell me if you are open on Sunday?",
      });

      expect(route.matched).toBe(false);
      expect(route.action).toBe("CLARIFY");
    });
  });
});
