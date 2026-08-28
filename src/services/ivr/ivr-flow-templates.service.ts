import type { IVREdge, IVRNode } from "@/components/ivr/types";

export interface IVRFlowTemplate {
  id: string;
  name: string;
  description: string;
  requiresResources: boolean;
  warnings: string[];
  nodes: IVRNode[];
  edges: IVREdge[];
}

interface TemplateNodeInput {
  id: string;
  kind: string;
  label: string;
  description: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}

function node(input: TemplateNodeInput): IVRNode {
  return {
    id: input.id,
    type: "ivr",
    position: input.position,
    data: {
      nodeKind: input.kind,
      label: input.label,
      description: input.description,
      ...input.data,
    },
  } as IVRNode;
}

function edge(source: string, target: string, trigger = "DEFAULT", value?: string): IVREdge {
  return {
    id: `${source}-${target}-${trigger.toLowerCase()}`,
    source,
    target,
    type: "smoothstep",
    data: value ? { trigger, value } : { trigger },
  } as IVREdge;
}

const basicCustomerSupport = (): IVRFlowTemplate => ({
  id: "basic-customer-support",
  name: "Basic Customer Support",
  description: "Greeting, menu, approved knowledge, human transfer, and graceful ending.",
  requiresResources: true,
  warnings: [
    "Select approved knowledge documents before publishing.",
    "Choose a human transfer destination before publishing.",
  ],
  nodes: [
    node({
      id: "start",
      kind: "START",
      label: "Start",
      description: "Incoming call entry point.",
      position: { x: 120, y: 120 },
    }),
    node({
      id: "greeting",
      kind: "GREETING",
      label: "Greeting",
      description: "Welcome the caller and explain the available options.",
      position: { x: 340, y: 120 },
      data: {
        prompt: "Welcome. How can I help you today?",
        nextNodeId: "menu",
      },
    }),
    node({
      id: "menu",
      kind: "HYBRID_MENU",
      label: "Hybrid Menu",
      description: "Offer a choice between knowledge and a human handoff.",
      position: { x: 580, y: 120 },
      data: {
        prompt: "Press 1 for help, 2 to speak to an agent.",
        allowNaturalLanguageEscape: true,
        escapeNodeId: "knowledge",
        runtimeMenu: {
          type: "DTMF_MENU",
          prompt: "Press 1 for help, 2 to speak to an agent.",
          invalidPrompt: "That option is not available. Please try again.",
          timeoutPrompt: "I did not receive a selection. Please try again.",
          exhaustedPrompt: "I am having trouble receiving your keypad selection. Please continue using the voice assistant.",
          maxAttempts: 3,
        },
        options: [
            {
              digit: "1",
              action: "CONTINUE_AI",
              label: "Help",
              response: "Connecting you to our knowledge resources.",
              destinationNodeId: "knowledge",
            },
            {
              digit: "2",
              action: "HUMAN_AGENT",
              label: "Agent",
              response: "Connecting you to a team member.",
              destinationNodeId: "transfer",
            },
        ],
      },
    }),
    node({
      id: "knowledge",
      kind: "KNOWLEDGE",
      label: "Knowledge",
      description: "Answer from approved tenant knowledge.",
      position: { x: 840, y: 40 },
      data: {
        prompt: "Use approved knowledge documents to answer the caller.",
        knowledgeDocumentIds: [],
      },
    }),
    node({
      id: "transfer",
      kind: "HUMAN_TRANSFER",
      label: "Human Transfer",
      description: "Escalate to an authorized destination.",
      position: { x: 840, y: 220 },
      data: {
        prompt: "Connecting you to a human agent.",
        transferDestinationId: "",
      },
    }),
    node({
      id: "end",
      kind: "END_CALL",
      label: "End Call",
      description: "Close the call politely.",
      position: { x: 1080, y: 120 },
      data: {
        prompt: "Thank you for calling. Goodbye.",
      },
    }),
  ],
  edges: [
    edge("start", "greeting"),
    edge("greeting", "menu"),
    edge("menu", "knowledge", "DEFAULT", "1"),
    edge("menu", "transfer", "DEFAULT", "2"),
    edge("knowledge", "end"),
    edge("transfer", "end"),
  ],
});

const appointmentCallback = (): IVRFlowTemplate => ({
  id: "appointment-callback",
  name: "Appointment / Callback",
  description: "A callback-first flow for scheduled follow-up and closure.",
  requiresResources: true,
  warnings: [
    "Configure callback scheduling before publishing.",
  ],
  nodes: [
    node({
      id: "start",
      kind: "START",
      label: "Start",
      description: "Incoming call entry point.",
      position: { x: 120, y: 120 },
    }),
    node({
      id: "greeting",
      kind: "GREETING",
      label: "Greeting",
      description: "Open with a friendly callback explanation.",
      position: { x: 340, y: 120 },
      data: {
        prompt: "Thanks for calling. I can help schedule a callback.",
        nextNodeId: "menu",
      },
    }),
    node({
      id: "menu",
      kind: "HYBRID_MENU",
      label: "Hybrid Menu",
      description: "Offer callback scheduling or live support.",
      position: { x: 580, y: 120 },
      data: {
        prompt: "Press 1 to schedule a callback, 2 for a live agent.",
        runtimeMenu: {
          type: "DTMF_MENU",
          prompt: "Press 1 to schedule a callback, 2 for a live agent.",
          invalidPrompt: "That option is not available. Please try again.",
          timeoutPrompt: "I did not receive a selection. Please try again.",
          exhaustedPrompt: "I am having trouble receiving your keypad selection. Please continue using the voice assistant.",
          maxAttempts: 3,
        },
        options: [
            {
              digit: "1",
              action: "REQUEST_CALLBACK",
              label: "Callback",
              response: "Let us schedule your callback.",
              destinationNodeId: "callback",
            },
            {
              digit: "2",
              action: "HUMAN_AGENT",
              label: "Agent",
              response: "Connecting you to a human agent.",
              destinationNodeId: "transfer",
            },
        ],
      },
    }),
    node({
      id: "callback",
      kind: "CALLBACK",
      label: "Callback",
      description: "Capture a callback request.",
      position: { x: 840, y: 40 },
      data: {
        prompt: "Select a callback window and confirm your request.",
        callbackConfigId: "",
      },
    }),
    node({
      id: "transfer",
      kind: "HUMAN_TRANSFER",
      label: "Human Transfer",
      description: "Escalate to an authorized destination.",
      position: { x: 840, y: 220 },
      data: {
        prompt: "Connecting you to a human agent.",
        transferDestinationId: "",
      },
    }),
    node({
      id: "end",
      kind: "END_CALL",
      label: "End Call",
      description: "Close the call politely.",
      position: { x: 1080, y: 120 },
      data: {
        prompt: "Thank you. Goodbye.",
      },
    }),
  ],
  edges: [
    edge("start", "greeting"),
    edge("greeting", "menu"),
    edge("menu", "callback", "DEFAULT", "1"),
    edge("menu", "transfer", "DEFAULT", "2"),
    edge("callback", "end"),
    edge("transfer", "end"),
  ],
});

const informationHotline = (): IVRFlowTemplate => ({
  id: "information-hotline",
  name: "Information Hotline",
  description: "Answer questions from knowledge and optionally send approved information.",
  requiresResources: true,
  warnings: [
    "Attach approved knowledge and send-information content before publishing.",
  ],
  nodes: [
    node({
      id: "start",
      kind: "START",
      label: "Start",
      description: "Incoming call entry point.",
      position: { x: 120, y: 120 },
    }),
    node({
      id: "greeting",
      kind: "GREETING",
      label: "Greeting",
      description: "Introduce the hotline and available information.",
      position: { x: 340, y: 120 },
      data: {
        prompt: "Welcome to the information hotline.",
        nextNodeId: "knowledge",
      },
    }),
    node({
      id: "knowledge",
      kind: "KNOWLEDGE",
      label: "Knowledge",
      description: "Answer from approved tenant knowledge.",
      position: { x: 580, y: 120 },
      data: {
        prompt: "Answer the caller using approved documents.",
        knowledgeDocumentIds: [],
      },
    }),
    node({
      id: "send-information",
      kind: "SEND_INFORMATION",
      label: "Send Information",
      description: "Send approved information on an allowed channel.",
      position: { x: 840, y: 40 },
      data: {
        prompt: "Offer a follow-up information summary.",
        sendInformationTemplateId: "",
      },
    }),
    node({
      id: "end",
      kind: "END_CALL",
      label: "End Call",
      description: "Close the call politely.",
      position: { x: 1080, y: 120 },
      data: {
        prompt: "Thank you for calling. Goodbye.",
      },
    }),
  ],
  edges: [
    edge("start", "greeting"),
    edge("greeting", "knowledge"),
    edge("knowledge", "send-information"),
    edge("send-information", "end"),
  ],
});

const businessHoursRouting = (): IVRFlowTemplate => ({
  id: "business-hours-routing",
  name: "Business Hours Routing",
  description: "Route callers based on business hours, with transfer and callback fallbacks.",
  requiresResources: true,
  warnings: [
    "Configure business-hours policy and transfer destination before publishing.",
  ],
  nodes: [
    node({
      id: "start",
      kind: "START",
      label: "Start",
      description: "Incoming call entry point.",
      position: { x: 120, y: 120 },
    }),
    node({
      id: "greeting",
      kind: "GREETING",
      label: "Greeting",
      description: "Explain hours-based routing.",
      position: { x: 340, y: 120 },
      data: {
        prompt: "Let me check whether we are open right now.",
        nextNodeId: "hours",
      },
    }),
    node({
      id: "hours",
      kind: "BUSINESS_HOURS",
      label: "Business Hours",
      description: "Evaluate business hours policy.",
      position: { x: 580, y: 120 },
      data: {
        prompt: "Checking business hours.",
        businessHoursPolicyId: "",
      },
    }),
    node({
      id: "transfer",
      kind: "HUMAN_TRANSFER",
      label: "Human Transfer",
      description: "Transfer when the business is open.",
      position: { x: 840, y: 40 },
      data: {
        prompt: "Connecting you to a human agent.",
        transferDestinationId: "",
      },
    }),
    node({
      id: "callback",
      kind: "CALLBACK",
      label: "Callback",
      description: "Offer a callback outside business hours.",
      position: { x: 840, y: 220 },
      data: {
        prompt: "We are currently closed. Let us schedule a callback.",
        callbackConfigId: "",
      },
    }),
    node({
      id: "end",
      kind: "END_CALL",
      label: "End Call",
      description: "Close the call politely.",
      position: { x: 1080, y: 120 },
      data: {
        prompt: "Thank you for calling. Goodbye.",
      },
    }),
  ],
  edges: [
    edge("start", "greeting"),
    edge("greeting", "hours"),
    edge("hours", "transfer", "DEFAULT", "OPEN"),
    edge("hours", "callback", "DEFAULT", "CLOSED"),
    edge("transfer", "end"),
    edge("callback", "end"),
  ],
});

const aiAssistedSupport = (): IVRFlowTemplate => ({
  id: "ai-assisted-support",
  name: "AI Assisted Support",
  description: "A support-first flow that combines an AI conversation node with human fallback.",
  requiresResources: true,
  warnings: [
    "Review the AI conversation prompt and selected knowledge documents before publishing.",
  ],
  nodes: [
    node({
      id: "start",
      kind: "START",
      label: "Start",
      description: "Incoming call entry point.",
      position: { x: 120, y: 120 },
    }),
    node({
      id: "greeting",
      kind: "GREETING",
      label: "Greeting",
      description: "Open with a clear greeting.",
      position: { x: 340, y: 120 },
      data: {
        prompt: "Welcome. I can answer questions or connect you with a person.",
        nextNodeId: "menu",
      },
    }),
    node({
      id: "menu",
      kind: "HYBRID_MENU",
      label: "Hybrid Menu",
      description: "Offer AI help or a human transfer.",
      position: { x: 580, y: 120 },
      data: {
        prompt: "Press 1 for AI help, 2 for a human agent.",
        runtimeMenu: {
          type: "DTMF_MENU",
          prompt: "Press 1 for AI help, 2 for a human agent.",
          invalidPrompt: "That option is not available. Please try again.",
          timeoutPrompt: "I did not receive a selection. Please try again.",
          exhaustedPrompt: "I am having trouble receiving your keypad selection. Please continue using the voice assistant.",
          maxAttempts: 3,
        },
        options: [
            {
              digit: "1",
              action: "CONTINUE_AI",
              label: "AI help",
              response: "Let me connect you with the AI assistant.",
              destinationNodeId: "ai",
            },
            {
              digit: "2",
              action: "HUMAN_AGENT",
              label: "Human agent",
              response: "Connecting you to a human agent.",
              destinationNodeId: "transfer",
            },
        ],
      },
    }),
    node({
      id: "ai",
      kind: "AI_CONVERSATION",
      label: "AI Conversation",
      description: "Use an AI assistant to answer supported questions.",
      position: { x: 840, y: 40 },
      data: {
        prompt: "Use approved knowledge to answer the caller and escalate when needed.",
      },
    }),
    node({
      id: "transfer",
      kind: "HUMAN_TRANSFER",
      label: "Human Transfer",
      description: "Escalate to an authorized destination.",
      position: { x: 840, y: 220 },
      data: {
        prompt: "Connecting you to a human agent.",
        transferDestinationId: "",
      },
    }),
    node({
      id: "end",
      kind: "END_CALL",
      label: "End Call",
      description: "Close the call politely.",
      position: { x: 1080, y: 120 },
      data: {
        prompt: "Thank you for calling. Goodbye.",
      },
    }),
  ],
  edges: [
    edge("start", "greeting"),
    edge("greeting", "menu"),
    edge("menu", "ai", "DEFAULT", "1"),
    edge("menu", "transfer", "DEFAULT", "2"),
    edge("ai", "transfer"),
    edge("transfer", "end"),
  ],
});

const templates = [
  basicCustomerSupport,
  appointmentCallback,
  informationHotline,
  businessHoursRouting,
  aiAssistedSupport,
].map(factory => factory());

export function listIvrFlowTemplates(): IVRFlowTemplate[] {
  return templates.map(template => ({
    ...template,
    nodes: template.nodes.map(node => ({
      ...node,
      data: { ...node.data },
    })),
    edges: template.edges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
  }));
}

export function getIvrFlowTemplate(
  templateId: string
): IVRFlowTemplate | null {
  const id = templateId.trim();
  if (!id) {
    return null;
  }

  const template = templates.find(entry => entry.id === id);
  if (!template) {
    return null;
  }

  return {
    ...template,
    nodes: template.nodes.map(node => ({
      ...node,
      data: { ...node.data },
    })),
    edges: template.edges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
  };
}

export function getCanonicalIvrNodeKinds(): string[] {
  return [
    "START",
    "GREETING",
    "HYBRID_MENU",
    "AI_CONVERSATION",
    "KNOWLEDGE",
    "ACTION",
    "CONDITION",
    "BUSINESS_HOURS",
    "AUTH_GATE",
    "HUMAN_TRANSFER",
    "CALLBACK",
    "SEND_INFORMATION",
    "END_CALL",
  ];
}
