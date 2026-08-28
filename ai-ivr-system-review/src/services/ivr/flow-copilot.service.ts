import { z } from "zod";

import type { IVREdge, IVRNode } from "@/components/ivr/types";
import { generateAIResponse } from "@/services/ai/ai-response.service";

export const FlowCopilotModeSchema = z.enum([
  "GENERATE",
  "MODIFY",
  "EXPLAIN",
  "VALIDATE",
]);

export const FlowCopilotNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.object({}).catchall(z.unknown()),
});

export const FlowCopilotEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().optional(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  data: z.object({}).catchall(z.unknown()).optional(),
});

export const FlowCopilotFlowSchema = z.object({
  name: z.string().min(1).optional(),
  nodes: z.array(FlowCopilotNodeSchema),
  edges: z.array(FlowCopilotEdgeSchema),
});

export const FlowCopilotResponseSchema = z.object({
  summary: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  candidateFlow: FlowCopilotFlowSchema.optional(),
});

export type FlowCopilotMode = z.infer<typeof FlowCopilotModeSchema>;

export interface FlowCopilotContext {
  mode: FlowCopilotMode;
  prompt: string;
  flowName: string;
  currentFlow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  };
  supportedNodeKinds: string[];
  availableActions: string[];
  transferDestinations: string[];
  knowledgeDocuments: Array<{
    id: string;
    name: string;
    status: string;
    indexed: boolean;
  }>;
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) {
    return null;
  }

  return text.slice(first, last + 1);
}

function toSafeNode(node: IVRNode) {
  return {
    id: node.id,
    type: node.type ?? "ivr",
    position: node.position ?? { x: 0, y: 0 },
    data: node.data ?? {},
  };
}

function buildHeuristicSuggestion(
  context: FlowCopilotContext
) {
  const startNode = context.currentFlow.nodes[0] ?? {
    id: "start",
    type: "ivr",
    position: { x: 380, y: 100 },
    data: {
      nodeKind: "START",
      label: "Start",
      description: "Entry point for the flow.",
    },
  };

  const lowerPrompt = context.prompt.toLowerCase();
  const includeGreeting =
    context.mode !== "VALIDATE" &&
    (context.mode === "GENERATE" ||
      lowerPrompt.includes("greeting") ||
      lowerPrompt.includes("hello") ||
      lowerPrompt.includes("welcome"));

  const includeAi =
    context.mode !== "VALIDATE" &&
    (lowerPrompt.includes("ai") ||
      lowerPrompt.includes("question") ||
      lowerPrompt.includes("support") ||
      lowerPrompt.includes("product"));

  const includeCallback =
    lowerPrompt.includes("callback");
  const includeTransfer =
    lowerPrompt.includes("human") ||
    lowerPrompt.includes("agent") ||
    lowerPrompt.includes("transfer");
  const includeLead =
    lowerPrompt.includes("lead") ||
    lowerPrompt.includes("interested");
  const includeEnd =
    lowerPrompt.includes("end") ||
    lowerPrompt.includes("close") ||
    lowerPrompt.includes("finish");

  const nodes: IVRNode[] = [toSafeNode(startNode) as IVRNode];
  const edges: IVREdge[] = [];

  const greetingId = "ai-greeting";
  const aiId = "ai-conversation";
  const actionId = "ai-action";
  const transferId = "ai-transfer";
  const endId = "ai-end";

  if (includeGreeting) {
    nodes.push({
      id: greetingId,
      type: "ivr",
      position: { x: 600, y: 100 },
      data: {
        nodeKind: "GREETING",
        label: "Greeting",
        description: "Open the call with a business greeting.",
        prompt: "Welcome. How can I help you today?",
      },
    } as IVRNode);
    edges.push({
      id: "start-to-greeting",
      source: startNode.id,
      target: greetingId,
      type: "smoothstep",
      data: { trigger: "DEFAULT" },
    } as IVREdge);
  }

  if (includeAi) {
    nodes.push({
      id: aiId,
      type: "ivr",
      position: { x: 860, y: 100 },
      data: {
        nodeKind: "AI",
        label: "AI Assistant",
        description: "Handle the main conversation.",
        prompt: context.prompt.trim() || "Handle the customer conversation safely.",
      },
    } as IVRNode);
    edges.push({
      id: `${includeGreeting ? greetingId : startNode.id}-to-ai`,
      source: includeGreeting ? greetingId : startNode.id,
      target: aiId,
      type: "smoothstep",
      data: { trigger: "DEFAULT" },
    } as IVREdge);
  }

  if (includeLead || includeCallback || includeTransfer || includeEnd) {
    const previous = includeAi ? aiId : includeGreeting ? greetingId : startNode.id;

    if (includeLead) {
      nodes.push({
        id: actionId,
        type: "ivr",
        position: { x: 1120, y: 80 },
        data: {
          nodeKind: "ACTION",
          label: "Create Lead",
          description: "Capture the interested customer as a lead.",
          actionCode: context.availableActions.includes("CREATE_LEAD")
            ? "CREATE_LEAD"
            : "CUSTOM",
        },
      } as IVRNode);
      edges.push({
        id: `${previous}-to-action`,
        source: previous,
        target: actionId,
        type: "smoothstep",
        data: { trigger: "ACTION_SUCCESS" },
      } as IVREdge);
    }

    if (includeCallback) {
      nodes.push({
        id: `${actionId}-callback`,
        type: "ivr",
        position: { x: 1120, y: 240 },
        data: {
          nodeKind: "ACTION",
          label: "Request Callback",
          description: "Record the callback request.",
          actionCode: context.availableActions.includes("REQUEST_CALLBACK")
            ? "REQUEST_CALLBACK"
            : "CUSTOM",
        },
      } as IVRNode);
    }

    if (includeTransfer) {
      nodes.push({
        id: transferId,
        type: "ivr",
        position: { x: 1120, y: 400 },
        data: {
          nodeKind: "TRANSFER",
          label: "Human Transfer",
          description: "Transfer the caller to a configured human destination.",
        },
      } as IVRNode);
      edges.push({
        id: `${previous}-to-transfer`,
        source: previous,
        target: transferId,
        type: "smoothstep",
        data: { trigger: "HUMAN_TRANSFER" },
      } as IVREdge);
    }

    if (includeEnd) {
      nodes.push({
        id: endId,
        type: "ivr",
        position: { x: 1360, y: 180 },
        data: {
          nodeKind: "END_CALL",
          label: "End Call",
          description: "End the call gracefully.",
          prompt: "Thank you for calling. Goodbye.",
        },
      } as IVRNode);
      edges.push({
        id: `${previous}-to-end`,
        source: previous,
        target: endId,
        type: "smoothstep",
        data: { trigger: "DEFAULT" },
      } as IVREdge);
    }
  }

  const warnings: string[] = [];
  if (
    includeAi &&
    context.knowledgeDocuments.length === 0
  ) {
    warnings.push(
      "No campaign knowledge is attached. Add approved knowledge before relying on knowledge-grounded answers."
    );
  }

  if (context.transferDestinations.length === 0 && includeTransfer) {
    warnings.push(
      "No transfer destination is configured, so transfer paths should remain review-only."
    );
  }

  return {
    summary:
      context.mode === "EXPLAIN"
        ? `Current flow has ${context.currentFlow.nodes.length} nodes and ${context.currentFlow.edges.length} edges.`
        : `Generated a ${context.mode.toLowerCase()} draft with ${nodes.length} nodes.`,
    warnings,
    candidateFlow: {
      name: context.flowName,
      nodes,
      edges,
    },
  };
}

export async function buildFlowCopilotSuggestion(
  context: FlowCopilotContext
) {
  const prompt = [
    "You are an IVR flow copilot.",
    "Return JSON only.",
    "Use only supported node kinds, actions, and transfer destinations.",
    "Never invent cross-tenant data or unsupported capabilities.",
    "",
    `Mode: ${context.mode}`,
    `Flow name: ${context.flowName}`,
    `Supported node kinds: ${context.supportedNodeKinds.join(", ")}`,
    `Available actions: ${context.availableActions.join(", ") || "none"}`,
    `Transfer destinations: ${context.transferDestinations.join(", ") || "none"}`,
    `Knowledge documents: ${context.knowledgeDocuments.map(doc => doc.name).join(", ") || "none"}`,
    "",
    "Current flow JSON:",
    JSON.stringify(context.currentFlow, null, 2),
    "",
    "User instruction:",
    context.prompt,
    "",
    "Return an object with summary, warnings, and candidateFlow.",
  ].join("\n");

  try {
    const raw = await generateAIResponse(prompt);
    const extracted = extractJsonBlock(raw);

    if (!extracted) {
      return buildHeuristicSuggestion(context);
    }

    const parsed = FlowCopilotResponseSchema.parse(
      JSON.parse(extracted)
    );

    if (
      parsed.candidateFlow
    ) {
      return parsed;
    }

    return {
      ...parsed,
      ...buildHeuristicSuggestion(context),
    };
  } catch {
    return buildHeuristicSuggestion(context);
  }
}
