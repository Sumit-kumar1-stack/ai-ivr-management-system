import type { IVREdge, IVRNode } from "@/components/ivr/types";

export type IVRExperiencePreset =
  | "CLASSIC_IVR"
  | "SMART_IVR"
  | "ADAPTIVE_IVR"
  | "CONVERSATIONAL_IVR"
  | "CUSTOM";

export interface IVRExperiencePresetMetadata {
  id: IVRExperiencePreset;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  recommended?: boolean;
}

export const IVR_EXPERIENCE_PRESETS: IVRExperiencePresetMetadata[] = [
  {
    id: "CLASSIC_IVR",
    title: "Traditional IVR",
    subtitle: "Lowest cost. Keypad-first. No AI required.",
    description: "Deterministic DTMF keypad menus with actions, transfers, and authentication. Operates with zero AI dependency and lowest operational cost.",
    badge: "Zero AI",
  },
  {
    id: "SMART_IVR",
    title: "Smart IVR",
    subtitle: "Keypad + speech aliases + local knowledge.",
    description: "Keypad menus enhanced with spoken phrase aliases and fast local knowledge base matching with zero LLM generation required.",
    badge: "Hybrid Speech",
  },
  {
    id: "ADAPTIVE_IVR",
    title: "Adaptive AI IVR",
    subtitle: "Fast menus with AI only when callers need it.",
    description: "Recommended hybrid architecture. Deterministic menu navigation by default, with side-turn conversational escape when callers ask free-form questions.",
    badge: "Recommended",
    recommended: true,
  },
  {
    id: "CONVERSATIONAL_IVR",
    title: "Conversational AI IVR",
    subtitle: "Natural AI conversations with deterministic controls.",
    description: "Fluid natural language voice assistant powered by conversational AI, anchored by deterministic authentication gates and global navigation safety.",
    badge: "Full AI",
  },
  {
    id: "CUSTOM",
    title: "Start from Scratch",
    subtitle: "Configure everything manually.",
    description: "Neutral starting point with a single Start node. Build and customize every behavior node-by-node.",
    badge: "Manual",
  },
];

export interface PresetGenerationOptions {
  flowName?: string;
  knowledgeDocumentId?: string;
  transferDestinationId?: string;
  actionCode?: string;
}

function createNode(
  id: string,
  kind: string,
  label: string,
  description: string,
  position: { x: number; y: number },
  data?: Record<string, unknown>
): IVRNode {
  return {
    id,
    type: "ivr",
    position,
    data: {
      nodeKind: kind,
      label,
      description,
      ...data,
    },
  } as IVRNode;
}

function createEdge(
  source: string,
  target: string,
  trigger = "DEFAULT",
  value?: string,
  sourceHandle?: string
): IVREdge {
  return {
    id: `${source}-${target}-${trigger.toLowerCase()}${value ? `-${value}` : ""}`,
    source,
    target,
    type: "smoothstep",
    sourceHandle,
    data: value ? { trigger, value } : { trigger },
  } as IVREdge;
}

/**
 * Generates fresh canonical starter graphs for each experience preset.
 */
export function generatePresetFlow(
  preset: IVRExperiencePreset,
  options?: PresetGenerationOptions
): { nodes: IVRNode[]; edges: IVREdge[] } {
  const kbDocId = options?.knowledgeDocumentId ?? "doc-default";
  const transferDestId = options?.transferDestinationId ?? "dest-agent";
  const actCode = options?.actionCode ?? "CUSTOM";

  switch (preset) {
    case "CLASSIC_IVR": {
      // 100% Zero-AI Traditional Keypad IVR
      const nodes: IVRNode[] = [
        createNode("start", "START", "Start", "Entry point", { x: 100, y: 150 }, {
          runtimeMode: "STANDARD",
          runtimeDefault: "STANDARD",
          logicalRootMenuNodeId: "menu",
          navigation: {
            home: { enabled: true, digits: ["0"], phrases: ["main menu", "start over"] },
            back: { enabled: true, digits: ["*"], phrases: ["go back"] },
            repeat: { enabled: true, digits: ["#"], phrases: ["repeat options"] },
            end: { enabled: true, digits: ["9"], phrases: ["goodbye", "end call"] },
          },
        }),
        createNode("greeting", "GREETING", "Welcome Greeting", "Plays initial prompt", { x: 320, y: 150 }, {
          prompt: "Welcome to customer service. Please listen to the following options.",
          nextNodeId: "menu",
        }),
        createNode("menu", "DTMF_MENU", "Main Menu", "Keypad menu", { x: 550, y: 150 }, {
          prompt: "Press 1 for Account Services, 2 for Support, or 9 to end this call.",
          inputMode: "DTMF",
          invalidPrompt: "That is not a valid option. Please try again.",
          timeoutPrompt: "I did not receive your selection. Please make a selection.",
          exhaustedPrompt: "We are having trouble receiving your input. Goodbye.",
          conversationalEscape: { enabled: false },
          options: [
            { digit: "1", action: "CUSTOM", label: "Account Services", destinationNodeId: "auth_gate" },
            { digit: "2", action: "CUSTOM", label: "Support Agent", destinationNodeId: "auth_gate" },
            { digit: "9", action: "END_CALL", label: "End Call", destinationNodeId: "end" },
          ],
        }),
        createNode("auth_gate", "AUTH_GATE", "Security Verification", "Authentication gate", { x: 800, y: 150 }, {
          requiredAuthLevel: "AUTH_LEVEL_1",
          prompt: "For your security, please verify your account information.",
        }),
        createNode("action_service", "ACTION", "Account Service", "Executes transaction", { x: 1050, y: 50 }, {
          actionCode: actCode,
          postAction: { mode: "RETURN_HOME" },
        }),
        createNode("transfer_agent", "HUMAN_TRANSFER", "Agent Transfer", "Transfers to human agent", { x: 1050, y: 250 }, {
          transferDestinationId: transferDestId,
        }),
        createNode("end", "END_CALL", "End Call", "Graceful call termination", { x: 1300, y: 150 }, {
          prompt: "Thank you for calling. Have a great day. Goodbye.",
        }),
      ];

      const edges: IVREdge[] = [
        createEdge("start", "greeting", "DEFAULT"),
        createEdge("greeting", "menu", "DEFAULT"),
        createEdge("menu", "auth_gate", "DTMF", "1", "1"),
        createEdge("menu", "auth_gate", "DTMF", "2", "2"),
        createEdge("menu", "end", "DTMF", "9", "9"),
        createEdge("auth_gate", "action_service", "AUTHENTICATED"),
        createEdge("auth_gate", "transfer_agent", "AUTHENTICATED"),
        createEdge("auth_gate", "end", "NOT_AUTHENTICATED"),
        createEdge("action_service", "menu", "ACTION_SUCCESS"),
        createEdge("action_service", "end", "ACTION_FAILURE"),
        createEdge("transfer_agent", "end", "HUMAN_TRANSFER"),
        createEdge("transfer_agent", "end", "ACTION_FAILURE"),
      ];

      return { nodes, edges };
    }

    case "SMART_IVR": {
      // Keypad + Spoken Aliases + Local KB (Zero LLM Generation)
      const nodes: IVRNode[] = [
        createNode("start", "START", "Start", "Entry point", { x: 100, y: 150 }, {
          runtimeMode: "AUTO",
          runtimeDefault: "STANDARD",
          logicalRootMenuNodeId: "menu",
          navigation: {
            home: { enabled: true, digits: ["0"], phrases: ["main menu", "start over"] },
            back: { enabled: true, digits: ["*"], phrases: ["go back", "previous menu"] },
            repeat: { enabled: true, digits: ["#"], phrases: ["repeat options"] },
            end: { enabled: true, digits: ["9"], phrases: ["goodbye", "end call"] },
          },
        }),
        createNode("menu", "HYBRID_MENU", "Main Menu", "Keypad & speech menu", { x: 350, y: 150 }, {
          prompt: "Welcome. Press or say 1 for Store Hours & Location, 2 for Customer Inquiries, or 9 to End.",
          inputMode: "BOTH",
          conversationalEscape: { enabled: false },
          options: [
            {
              digit: "1",
              action: "CUSTOM",
              label: "Store Info",
              voicePhrases: ["store hours", "timings", "location", "address", "hours"],
              destinationNodeId: "knowledge_local",
            },
            {
              digit: "2",
              action: "CUSTOM",
              label: "Inquiries",
              voicePhrases: ["inquiries", "questions", "customer service", "help"],
              destinationNodeId: "auth_gate",
            },
            {
              digit: "9",
              action: "END_CALL",
              label: "End Call",
              voicePhrases: ["goodbye", "hang up", "end call"],
              destinationNodeId: "end",
            },
          ],
        }),
        createNode("knowledge_local", "KNOWLEDGE", "Store Info FAQ", "Local document lookup without AI generation", { x: 650, y: 50 }, {
          knowledgeDocumentIds: [kbDocId],
          aiPolicy: { mode: "NEVER", timeoutMs: 6000, failureBehavior: "LOCAL_KB" },
          postAction: { mode: "RETURN_PREVIOUS" },
        }),
        createNode("auth_gate", "AUTH_GATE", "Security Verification", "Authentication gate", { x: 650, y: 250 }, {
          requiredAuthLevel: "AUTH_LEVEL_1",
          prompt: "Please verify your account number.",
        }),
        createNode("action_inquiry", "ACTION", "Inquiry Service", "Executes inquiry tool", { x: 920, y: 250 }, {
          actionCode: actCode,
          postAction: { mode: "RETURN_HOME" },
        }),
        createNode("end", "END_CALL", "End Call", "Graceful call termination", { x: 1180, y: 150 }, {
          prompt: "Thank you for contacting us. Goodbye.",
        }),
      ];

      const edges: IVREdge[] = [
        createEdge("start", "menu", "DEFAULT"),
        createEdge("menu", "knowledge_local", "DTMF", "1", "1"),
        createEdge("menu", "auth_gate", "DTMF", "2", "2"),
        createEdge("menu", "end", "DTMF", "9", "9"),
        createEdge("knowledge_local", "menu", "KNOWLEDGE_FOUND"),
        createEdge("auth_gate", "action_inquiry", "AUTHENTICATED"),
        createEdge("auth_gate", "end", "NOT_AUTHENTICATED"),
        createEdge("action_inquiry", "menu", "ACTION_SUCCESS"),
        createEdge("action_inquiry", "end", "ACTION_FAILURE"),
      ];

      return { nodes, edges };
    }

    case "ADAPTIVE_IVR": {
      // Primary recommended hybrid experience: Deterministic navigation + Side-turn Conversational Escape
      const nodes: IVRNode[] = [
        createNode("start", "START", "Start", "Entry point", { x: 100, y: 150 }, {
          runtimeMode: "AUTO",
          runtimeDefault: "STANDARD",
          logicalRootMenuNodeId: "menu",
          navigation: {
            home: { enabled: true, digits: ["0"], phrases: ["main menu", "start over"] },
            back: { enabled: true, digits: ["*"], phrases: ["go back", "previous"] },
            repeat: { enabled: true, digits: ["#"], phrases: ["repeat options", "say again"] },
            end: { enabled: true, digits: ["9"], phrases: ["goodbye", "end call"] },
          },
        }),
        createNode("menu", "HYBRID_MENU", "Adaptive Main Menu", "Keypad menu with side-turn escape", { x: 360, y: 150 }, {
          prompt: "Welcome. Press or say 1 for Appointments, 2 for Billing, or 3 for Support. You can also ask any general question at any time.",
          inputMode: "BOTH",
          conversationalEscape: {
            enabled: true,
            targetNodeId: "faq_assistant",
            returnBehavior: "RETURN_CONTEXT",
            prompt: "Let me check that information for you.",
          },
          options: [
            {
              digit: "1",
              action: "CUSTOM",
              label: "Appointments",
              voicePhrases: ["appointments", "schedule", "book appointment"],
              destinationNodeId: "auth_gate",
            },
            {
              digit: "2",
              action: "CUSTOM",
              label: "Billing",
              voicePhrases: ["billing", "pay bill", "account balance"],
              destinationNodeId: "auth_gate",
            },
            {
              digit: "3",
              action: "CUSTOM",
              label: "Support",
              voicePhrases: ["support", "agent", "representative"],
              destinationNodeId: "auth_gate",
            },
            {
              digit: "9",
              action: "END_CALL",
              label: "End Call",
              voicePhrases: ["goodbye", "hang up", "end call"],
              destinationNodeId: "end",
            },
          ],
        }),
        createNode("faq_assistant", "KNOWLEDGE", "Knowledge Assistant", "Side-turn conversational FAQ", { x: 680, y: 30 }, {
          knowledgeDocumentIds: [kbDocId],
          aiPolicy: {
            mode: "FREE_FORM_ONLY",
            timeoutMs: 8000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.7,
            allowRerank: true,
          },
          postAction: { mode: "RETURN_PREVIOUS" },
        }),
        createNode("auth_gate", "AUTH_GATE", "Security Verification", "Authentication gate", { x: 680, y: 220 }, {
          requiredAuthLevel: "AUTH_LEVEL_1",
          prompt: "Please verify your account details before we proceed.",
        }),
        createNode("action_service", "ACTION", "Business Action", "Executes requested service", { x: 960, y: 180 }, {
          actionCode: actCode,
          postAction: { mode: "RETURN_HOME" },
        }),
        createNode("transfer_agent", "HUMAN_TRANSFER", "Agent Transfer", "Transfers to team", { x: 960, y: 300 }, {
          transferDestinationId: transferDestId,
        }),
        createNode("end", "END_CALL", "End Call", "Graceful call termination", { x: 1240, y: 150 }, {
          prompt: "Thank you for contacting us. Have a great day. Goodbye.",
        }),
      ];

      const edges: IVREdge[] = [
        createEdge("start", "menu", "DEFAULT"),
        createEdge("menu", "auth_gate", "DTMF", "1", "1"),
        createEdge("menu", "auth_gate", "DTMF", "2", "2"),
        createEdge("menu", "auth_gate", "DTMF", "3", "3"),
        createEdge("menu", "end", "DTMF", "9", "9"),
        createEdge("menu", "faq_assistant", "DEFAULT"),
        createEdge("faq_assistant", "menu", "KNOWLEDGE_FOUND"),
        createEdge("auth_gate", "action_service", "AUTHENTICATED"),
        createEdge("auth_gate", "transfer_agent", "AUTHENTICATED"),
        createEdge("auth_gate", "end", "NOT_AUTHENTICATED"),
        createEdge("action_service", "menu", "ACTION_SUCCESS"),
        createEdge("action_service", "end", "ACTION_FAILURE"),
        createEdge("transfer_agent", "end", "HUMAN_TRANSFER"),
        createEdge("transfer_agent", "end", "ACTION_FAILURE"),
      ];

      return { nodes, edges };
    }

    case "CONVERSATIONAL_IVR": {
      // Conversational AI voice assistant with deterministic security gates & navigation
      const nodes: IVRNode[] = [
        createNode("start", "START", "Start", "Entry point", { x: 100, y: 150 }, {
          runtimeMode: "AUTO",
          runtimeDefault: "PREMIUM",
          navigation: {
            home: { enabled: true, digits: ["0"], phrases: ["main menu", "start over"] },
            back: { enabled: true, digits: ["*"], phrases: ["go back"] },
            repeat: { enabled: true, digits: ["#"], phrases: ["repeat that", "say again"] },
            end: { enabled: true, digits: ["9"], phrases: ["goodbye", "hang up", "end call"] },
          },
        }),
        createNode("greeting", "GREETING", "Welcome", "Initial assistant greeting", { x: 330, y: 150 }, {
          prompt: "Hello! I am your virtual assistant. How can I help you today?",
          nextNodeId: "ai_conversation",
        }),
        createNode("ai_conversation", "AI_CONVERSATION", "AI Voice Assistant", "Natural conversational dialogue", { x: 580, y: 150 }, {
          prompt: "You are a professional voice assistant. Answer caller questions concisely using verified knowledge.",
          knowledgeDocumentIds: [kbDocId],
          aiPolicy: {
            mode: "ALWAYS_CONVERSATIONAL",
            timeoutMs: 10000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.65,
            allowRerank: true,
          },
        }),
        createNode("auth_gate", "AUTH_GATE", "Security Verification", "Authentication gate", { x: 860, y: 150 }, {
          requiredAuthLevel: "AUTH_LEVEL_1",
          prompt: "For sensitive operations, please authenticate your account.",
        }),
        createNode("action_tool", "ACTION", "Account Operation", "Authorized business tool", { x: 1120, y: 80 }, {
          actionCode: actCode,
          postAction: { mode: "RETURN_PREVIOUS" },
        }),
        createNode("transfer_agent", "HUMAN_TRANSFER", "Escalate to Agent", "Live agent transfer", { x: 1120, y: 220 }, {
          transferDestinationId: transferDestId,
        }),
        createNode("end", "END_CALL", "End Call", "Graceful call termination", { x: 1380, y: 150 }, {
          prompt: "Thank you for speaking with me. Have a wonderful day. Goodbye.",
        }),
      ];

      const edges: IVREdge[] = [
        createEdge("start", "greeting", "DEFAULT"),
        createEdge("greeting", "ai_conversation", "DEFAULT"),
        createEdge("ai_conversation", "auth_gate", "DEFAULT"),
        createEdge("ai_conversation", "end", "DEFAULT"),
        createEdge("auth_gate", "action_tool", "AUTHENTICATED"),
        createEdge("auth_gate", "transfer_agent", "AUTHENTICATED"),
        createEdge("auth_gate", "end", "NOT_AUTHENTICATED"),
        createEdge("action_tool", "ai_conversation", "ACTION_SUCCESS"),
        createEdge("action_tool", "end", "ACTION_FAILURE"),
        createEdge("transfer_agent", "end", "HUMAN_TRANSFER"),
        createEdge("transfer_agent", "end", "ACTION_FAILURE"),
      ];

      return { nodes, edges };
    }

    case "CUSTOM":
    default: {
      // Neutral default start node
      const nodes: IVRNode[] = [
        createNode("start", "START", "Start", "Incoming call entry point", { x: 400, y: 120 }, {
          runtimeMode: "AUTO",
          runtimeDefault: "STANDARD",
        }),
      ];
      return { nodes, edges: [] };
    }
  }
}

/**
 * Applies a preset's behavioral philosophy onto an existing flow draft,
 * modifying draft properties in-place without deleting custom business nodes.
 */
export function applyPresetToFlow(
  currentFlow: { nodes: IVRNode[]; edges: IVREdge[] },
  preset: IVRExperiencePreset
): {
  nodes: IVRNode[];
  edges: IVREdge[];
  summary: string[];
  changesCount: number;
} {
  // If the flow is blank (only START or empty), generate the full starter template
  if (
    currentFlow.nodes.length <= 1 &&
    currentFlow.nodes.every(n => (n.data?.nodeKind ?? "START") === "START")
  ) {
    const generated = generatePresetFlow(preset);
    const meta = IVR_EXPERIENCE_PRESETS.find(p => p.id === preset);
    return {
      nodes: generated.nodes,
      edges: generated.edges,
      summary: [`Initialized canvas with "${meta?.title ?? preset}" preset architecture.`],
      changesCount: generated.nodes.length,
    };
  }

  const modifiedNodes: IVRNode[] = JSON.parse(JSON.stringify(currentFlow.nodes));
  const modifiedEdges: IVREdge[] = JSON.parse(JSON.stringify(currentFlow.edges));
  const summary: string[] = [];
  let changesCount = 0;

  switch (preset) {
    case "CLASSIC_IVR": {
      // Turn off conversational escape, set all AI policies to NEVER, set inputMode to DTMF
      for (const n of modifiedNodes) {
        const kind = n.data?.nodeKind ?? "START";
        const d = n.data as Record<string, unknown>;

        if (kind === "START") {
          if (d.runtimeMode !== "STANDARD") {
            d.runtimeMode = "STANDARD";
            summary.push(`Set START runtimeMode to STANDARD on node ${n.id}`);
            changesCount += 1;
          }
        }

        if (kind === "DTMF_MENU" || kind === "HYBRID_MENU") {
          if (d.inputMode !== "DTMF") {
            d.inputMode = "DTMF";
            summary.push(`Configured ${n.id} input mode to DTMF only`);
            changesCount += 1;
          }
          if (d.conversationalEscape) {
            d.conversationalEscape = { enabled: false };
            delete d.allowNaturalLanguageEscape;
            summary.push(`Disabled Conversational Escape on menu node ${n.id}`);
            changesCount += 1;
          }
        }

        if (kind === "KNOWLEDGE" || kind === "AI" || kind === "AI_CONVERSATION") {
          d.aiPolicy = {
            mode: "NEVER",
            timeoutMs: 8000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.7,
            allowRerank: false,
          };
          summary.push(`Set AI policy to NEVER on ${kind} node ${n.id}`);
          changesCount += 1;
        }
      }
      break;
    }

    case "SMART_IVR": {
      // DTMF + speech aliases, local KB with AI NEVER, escape disabled
      for (const n of modifiedNodes) {
        const kind = n.data?.nodeKind ?? "START";
        const d = n.data as Record<string, unknown>;

        if (kind === "DTMF_MENU" || kind === "HYBRID_MENU") {
          if (d.inputMode !== "BOTH") {
            d.inputMode = "BOTH";
            summary.push(`Enabled DTMF and speech input mode on menu node ${n.id}`);
            changesCount += 1;
          }
          if (d.conversationalEscape) {
            d.conversationalEscape = { enabled: false };
            delete d.allowNaturalLanguageEscape;
            summary.push(`Set Conversational Escape to disabled by default on menu node ${n.id}`);
            changesCount += 1;
          }
        }

        if (kind === "KNOWLEDGE") {
          d.aiPolicy = {
            mode: "NEVER",
            timeoutMs: 6000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.7,
            allowRerank: false,
          };
          summary.push(`Set local knowledge retrieval AI policy to NEVER on node ${n.id}`);
          changesCount += 1;
        }
      }
      break;
    }

    case "ADAPTIVE_IVR": {
      // Deterministic navigation + Conversational Escape (FREE_FORM_ONLY) on menus
      const knowledgeNode = modifiedNodes.find(
        n => (n.data?.nodeKind ?? "") === "KNOWLEDGE" || (n.data?.nodeKind ?? "") === "AI"
      );
      const targetId = knowledgeNode?.id ?? "faq_assistant";

      for (const n of modifiedNodes) {
        const kind = n.data?.nodeKind ?? "START";
        const d = n.data as Record<string, unknown>;

        if (kind === "DTMF_MENU" || kind === "HYBRID_MENU") {
          d.inputMode = "BOTH";
          d.conversationalEscape = {
            enabled: true,
            targetNodeId: targetId,
            returnBehavior: "RETURN_CONTEXT",
            prompt: "Let me check that information for you.",
          };
          summary.push(`Enabled Conversational Escape with RETURN_CONTEXT on menu node ${n.id}`);
          changesCount += 1;
        }

        if (kind === "KNOWLEDGE" || kind === "AI") {
          d.aiPolicy = {
            mode: "FREE_FORM_ONLY",
            timeoutMs: 8000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.7,
            allowRerank: true,
          };
          summary.push(`Configured AI policy to FREE_FORM_ONLY on node ${n.id}`);
          changesCount += 1;
        }
      }
      break;
    }

    case "CONVERSATIONAL_IVR": {
      // Conversational AI nodes set to ALWAYS_CONVERSATIONAL, maintaining deterministic gates
      for (const n of modifiedNodes) {
        const kind = n.data?.nodeKind ?? "START";
        const d = n.data as Record<string, unknown>;

        if (kind === "AI" || kind === "AI_CONVERSATION" || kind === "KNOWLEDGE") {
          d.aiPolicy = {
            mode: "ALWAYS_CONVERSATIONAL",
            timeoutMs: 10000,
            failureBehavior: "LOCAL_KB",
            confidenceThreshold: 0.65,
            allowRerank: true,
          };
          summary.push(`Set AI policy to ALWAYS_CONVERSATIONAL on node ${n.id}`);
          changesCount += 1;
        }
      }
      break;
    }

    case "CUSTOM":
    default: {
      summary.push("Preserved custom flow configuration.");
      break;
    }
  }

  return {
    nodes: modifiedNodes,
    edges: modifiedEdges,
    summary,
    changesCount,
  };
}
