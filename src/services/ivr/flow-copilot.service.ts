import { z } from "zod";

import type { IVREdge, IVRNode } from "@/components/ivr/types";
import { AppError } from "@/lib/app-error";
import { createLogger } from "@/lib/logger";
import { generateAIResponse } from "@/services/ai/ai-response.service";
import { applyFlowCopilotPatch } from "@/services/ivr/flow-copilot-patch.service";
import { normalizeIVRMenuRouting } from "@/services/ivr/ivr-menu-routing.service";
import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";

const log = createLogger({ component: "ivr-flow-copilot" });

export const FlowCopilotModeSchema = z.enum([
  "GENERATE",
  "MODIFY",
  "EXPLAIN",
  "VALIDATE",
  "REPAIR",
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
  description: z.string().min(1).optional(),
  nodes: z.array(FlowCopilotNodeSchema),
  edges: z.array(FlowCopilotEdgeSchema),
  metadata: z.object({}).catchall(z.unknown()).optional(),
});

export const FlowCopilotPatchOperationSchema = z.object({
  op: z.enum([
    "addNode",
    "updateNode",
    "removeNode",
    "addEdge",
    "updateEdge",
    "removeEdge",
  ]),
  targetId: z.string().min(1).optional(),
  node: FlowCopilotNodeSchema.optional(),
  edge: FlowCopilotEdgeSchema.optional(),
  patch: z.object({}).catchall(z.unknown()).optional(),
});

export const FlowCopilotPatchSchema = z.object({
  operations: z.array(FlowCopilotPatchOperationSchema),
  added: z.array(z.string().min(1)).default([]),
  modified: z.array(z.string().min(1)).default([]),
  removed: z.array(z.string().min(1)).default([]),
});

export const FlowCopilotValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      code: z.string().min(1),
      nodeId: z.string().nullable(),
      field: z.string().nullable(),
      message: z.string().min(1),
      severity: z.enum(["ERROR", "WARNING"]),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string().min(1),
      nodeId: z.string().nullable(),
      field: z.string().nullable(),
      message: z.string().min(1),
      severity: z.enum(["ERROR", "WARNING"]),
    })
  ),
  issues: z.array(
    z.object({
      code: z.string().min(1),
      nodeId: z.string().nullable(),
      field: z.string().nullable(),
      message: z.string().min(1),
      severity: z.enum(["ERROR", "WARNING"]),
    })
  ).optional(),
});

export const FlowCopilotResponseSchema = z.object({
  summary: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  missingResources: z.array(z.string()).default([]),
  suggestedTests: z.array(z.string()).default([]),
  candidateFlow: FlowCopilotFlowSchema.optional(),
  candidatePatch: FlowCopilotPatchSchema.optional(),
  validation: FlowCopilotValidationSchema.optional(),
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
  validation?: ReturnType<typeof validateIVRFlowDefinition>;
  supportedNodeKinds: string[];
  availableActions: string[];
  transferDestinations: Array<{
    id: string;
    label: string;
  }>;
  knowledgeDocuments: Array<{
    id: string;
    name: string;
    status: string;
    indexed: boolean;
  }>;
  approvedMessageTemplates?: Array<{
    id: string;
    label: string;
  }>;
  inboundProfiles?: Array<{
    id: string;
    label: string;
    active: boolean;
  }>;
  campaigns?: Array<{
    id: string;
    label: string;
    status: string;
  }>;
  resourceWarnings?: string[];
  resourceAuthorization?: Pick<
    Parameters<typeof validateIVRFlowDefinition>[0],
    | "allowedKnowledgeDocumentIds"
    | "allowedActionCodes"
    | "allowedTransferDestinationIds"
    | "allowedCallbackDestinationIds"
    | "allowedTemplateIds"
    | "allowedBusinessHoursPolicyIds"
    | "allowedAuthenticationLevels"
  >;
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = fenced ? [fenced] : [];

  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }

  return candidates.find(candidate => {
    try {
      JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  }) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeModelResponseContract(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const response = { ...value };
  if (!stringValue(response.summary)) {
    response.summary = "Generated an IVR candidate for review.";
  }
  for (const field of ["warnings", "assumptions", "missingResources", "suggestedTests"] as const) {
    if (response[field] === undefined || response[field] === null) {
      response[field] = [];
    }
  }

  if (!isRecord(response.candidateFlow)) return response;
  const candidateFlow = { ...response.candidateFlow };
  if (Array.isArray(candidateFlow.nodes)) {
    candidateFlow.nodes = candidateFlow.nodes.map((node, index) => {
      if (!isRecord(node)) return node;
      const position = isRecord(node.position) ? node.position : {};
      return {
        ...node,
        type: stringValue(node.type) ?? "ivr",
        position: {
          x: finiteNumber(position.x, index * 280),
          y: finiteNumber(position.y, 0),
        },
        data: isRecord(node.data) ? node.data : {},
      };
    });
  }
  if (Array.isArray(candidateFlow.edges)) {
    candidateFlow.edges = candidateFlow.edges.map(edge => {
      if (!isRecord(edge)) return edge;
      const normalized = { ...edge };
      if (normalized.sourceHandle === null) delete normalized.sourceHandle;
      if (normalized.targetHandle === null) delete normalized.targetHandle;
      if (normalized.data === null) delete normalized.data;
      if (typeof normalized.sourceHandle === "number") normalized.sourceHandle = String(normalized.sourceHandle);
      if (typeof normalized.targetHandle === "number") normalized.targetHandle = String(normalized.targetHandle);
      if (normalized.data !== undefined && !isRecord(normalized.data)) return edge;
      return normalized;
    });
  }
  response.candidateFlow = candidateFlow;
  return response;
}

function toSafeNode(node: IVRNode) {
  return {
    id: node.id,
    type: node.type ?? "ivr",
    position: node.position ?? { x: 0, y: 0 },
    data: node.data ?? {},
  };
}

function buildPersonalLoanMenuSuggestion(context: FlowCopilotContext) {
  const startNode = context.currentFlow.nodes.find(node => nodeKind(node) === "START") ?? {
    id: "start", type: "ivr", position: { x: 100, y: 220 }, data: { nodeKind: "START", label: "Start" },
  } as IVRNode;
  const knowledgeId = context.knowledgeDocuments[0]?.id;
  const transferId = context.transferDestinations[0]?.id;
  if (!knowledgeId) return null;

  const nodes: IVRNode[] = [
    toSafeNode(startNode) as IVRNode,
    { id: "greeting", type: "ivr", position: { x: 340, y: 220 }, data: { nodeKind: "GREETING", label: "Greeting", prompt: "Welcome to DemoBank Personal Loans. How can I help you today?" } } as IVRNode,
    {
      id: "hybrid_menu", type: "ivr", position: { x: 600, y: 220 }, data: {
        nodeKind: "HYBRID_MENU", label: "Main Menu", prompt: "For loan information, press or say 1. For eligibility, 2. For documents, 3. To speak with an agent, 4. To end the call, 9.",
        allowNaturalLanguageEscape: true, escapeNodeId: "knowledge",
        runtimeMenu: { type: "DTMF_MENU", prompt: "Choose an option.", invalidPrompt: "I did not understand that choice.", timeoutPrompt: "Please choose an option.", exhaustedPrompt: "We will end the call now.", maxAttempts: 3 },
        options: [
          { digit: "1", action: "LOAN_INFORMATION", label: "Loan information", destinationNodeId: "knowledge", voicePhrases: ["loan", "loan information", "personal loan"] },
          { digit: "2", action: "CUSTOM", label: "Eligibility", destinationNodeId: "knowledge", voicePhrases: ["eligibility", "am i eligible", "eligibility requirements"] },
          { digit: "3", action: "CUSTOM", label: "Documents", destinationNodeId: "knowledge", voicePhrases: ["documents", "required documents", "kyc documents"] },
          ...(transferId ? [{ digit: "4", action: "HUMAN_AGENT", label: "Agent", destinationNodeId: "human_transfer", voicePhrases: ["agent", "human agent", "talk to agent", "representative"] }] : []),
          { digit: "9", action: "END_CALL", label: "Goodbye", destinationNodeId: "end_call", voicePhrases: ["goodbye", "exit", "end call"] },
        ],
      },
    } as IVRNode,
    { id: "knowledge", type: "ivr", position: { x: 900, y: 100 }, data: { nodeKind: "KNOWLEDGE", label: "Personal Loan Knowledge", question: "Answer the caller's personal loan question.", knowledgeDocumentIds: [knowledgeId] } } as IVRNode,
    ...(transferId ? [{ id: "human_transfer", type: "ivr", position: { x: 900, y: 300 }, data: { nodeKind: "HUMAN_TRANSFER", label: "Human Transfer", transferDestinationId: transferId } } as IVRNode] : []),
    { id: "end_call", type: "ivr", position: { x: 1200, y: 220 }, data: { nodeKind: "END_CALL", label: "End Call", prompt: "Thank you for calling DemoBank. Goodbye." } } as IVRNode,
  ];
  const edges: IVREdge[] = [
    { id: "start-greeting", source: startNode.id, target: "greeting", type: "smoothstep", data: { trigger: "DEFAULT" } },
    { id: "greeting-menu", source: "greeting", target: "hybrid_menu", type: "smoothstep", data: { trigger: "DEFAULT" } },
    ...["1", "2", "3"].map(digit => ({ id: `menu-${digit}`, source: "hybrid_menu", target: "knowledge", type: "smoothstep", sourceHandle: digit, data: { trigger: "DTMF", value: digit } } as IVREdge)),
    { id: "knowledge-found-menu", source: "knowledge", target: "hybrid_menu", type: "smoothstep", data: { trigger: "KNOWLEDGE_FOUND" } },
    { id: "knowledge-no-match-menu", source: "knowledge", target: "hybrid_menu", type: "smoothstep", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
    ...(transferId ? [
      { id: "menu-transfer", source: "hybrid_menu", target: "human_transfer", type: "smoothstep", sourceHandle: "4", data: { trigger: "DTMF", value: "4" } },
      { id: "transfer-end", source: "human_transfer", target: "end_call", type: "smoothstep", data: { trigger: "HUMAN_TRANSFER" } },
      { id: "transfer-failure-end", source: "human_transfer", target: "end_call", type: "smoothstep", data: { trigger: "ACTION_FAILURE" } },
    ] as IVREdge[] : []),
    { id: "menu-end", source: "hybrid_menu", target: "end_call", type: "smoothstep", sourceHandle: "9", data: { trigger: "DTMF", value: "9" } },
  ];

  return {
    summary: "Generated a resource-authorized DemoBank personal-loan menu with knowledge return-to-menu and safe transfer fallback.",
    warnings: transferId ? [] : ["No authorized transfer destination exists, so the agent option was omitted."],
    assumptions: ["All knowledge answers use the first authorized personal-loan document in the tenant catalog."],
    missingResources: [],
    suggestedTests: [],
    candidateFlow: {
      name: context.flowName,
      nodes: nodes.map(toSafeNode),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        sourceHandle: stringValue(edge.sourceHandle) ?? undefined,
        targetHandle: stringValue(edge.targetHandle) ?? undefined,
        data: edge.data ? { ...edge.data } : undefined,
      })),
    },
  };
}

function buildHeuristicSuggestion(
  context: FlowCopilotContext
) {
  const requestedPersonalLoanMenu =
    context.mode === "GENERATE" &&
    context.knowledgeDocuments.length > 0 &&
    /loan|eligib|document|kyc/.test(context.prompt.toLowerCase());
  if (requestedPersonalLoanMenu) {
    const menuSuggestion = buildPersonalLoanMenuSuggestion(context);
    if (menuSuggestion) return menuSuggestion;
  }

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
        nodeKind: "AI_CONVERSATION",
        label: "AI Assistant",
        description: "Handle the main conversation.",
        prompt: context.prompt.trim() || "Handle the customer conversation safely.",
        knowledgeDocumentIds: context.knowledgeDocuments.slice(0, 1).map(document => document.id),
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
          nodeKind: "HUMAN_TRANSFER",
          label: "Human Transfer",
          description: "Transfer the caller to a configured human destination.",
          transferDestinationId: context.transferDestinations[0]?.id ?? "",
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

  const safeNodes = nodes.map(toSafeNode);
  const safeEdges = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    sourceHandle: stringValue(edge.sourceHandle) ?? undefined,
    targetHandle: stringValue(edge.targetHandle) ?? undefined,
    data: edge.data ? { ...edge.data } : undefined,
  }));

  return {
    summary:
      context.mode === "EXPLAIN"
        ? `Current flow has ${context.currentFlow.nodes.length} nodes and ${context.currentFlow.edges.length} edges.`
        : `Generated a ${context.mode.toLowerCase()} draft with ${nodes.length} nodes.`,
    warnings,
    assumptions:
      context.mode === "EXPLAIN"
        ? [
            "This explanation was generated from the current editor graph, not from published runtime state.",
          ]
        : [
            "The generated draft is a candidate only and still requires deterministic validation before publish.",
          ],
    missingResources: collectMissingResources(
      context,
      {
        nodes,
        edges,
      }
    ),
    suggestedTests: deriveSuggestedTests(
      {
        nodes: safeNodes as IVRNode[],
        edges: safeEdges as IVREdge[],
      }
    ),
    candidateFlow: {
      name: context.flowName,
      nodes: safeNodes,
      edges: safeEdges,
    },
  };
}

function cloneFlow(
  flow: {
    name?: string;
    description?: string;
    nodes: IVRNode[];
    edges: IVREdge[];
    metadata?: Record<string, unknown>;
  }
): {
  name?: string;
  description?: string;
  nodes: IVRNode[];
  edges: IVREdge[];
  metadata?: Record<string, unknown>;
} {
  return {
    name: flow.name,
    description: flow.description,
    nodes: flow.nodes.map(node => ({
      ...node,
      data: { ...(node.data ?? {}) },
      position: { ...node.position },
    })),
    edges: flow.edges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
    metadata: flow.metadata ? { ...flow.metadata } : undefined,
  };
}

function buildValidationSnapshot(
  flow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  },
  resourceAuthorization?: FlowCopilotContext["resourceAuthorization"],
  supportedNodeKinds: string[] = []
) {
  const validation = validateIVRFlowDefinition({
    nodes: flow.nodes,
    edges: flow.edges,
    ...resourceAuthorization,
  });
  const allowed = new Set(supportedNodeKinds.map(kind => kind.trim().toUpperCase()));
  const errors = flow.nodes.flatMap(node => {
    const nodeKind = stringValue(node.data?.nodeKind)?.toUpperCase() ?? "";
    return nodeKind && allowed.has(nodeKind)
      ? []
      : [{
          code: "COPILOT_NODE_NOT_SUPPORTED",
          nodeId: node.id,
          field: "nodeKind",
          message: `Node type ${nodeKind || "UNKNOWN"} is not available in this builder context.`,
          severity: "ERROR" as const,
        }];
  });

  if (errors.length === 0) {
    return validation;
  }

  return {
    valid: false,
    errors: [...validation.errors, ...errors],
    warnings: validation.warnings,
    issues: [...validation.issues, ...errors],
  };
}

function buildFlowPatchPreview(
  currentFlow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  },
  candidateFlow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  }
) {
  const currentNodes = new Map(currentFlow.nodes.map(node => [node.id, node] as const));
  const candidateNodes = new Map(candidateFlow.nodes.map(node => [node.id, node] as const));
  const currentEdges = new Map(currentFlow.edges.map(edge => [edge.id, edge] as const));
  const candidateEdges = new Map(candidateFlow.edges.map(edge => [edge.id, edge] as const));

  const operations: Array<{
    op: "addNode" | "updateNode" | "removeNode" | "addEdge" | "updateEdge" | "removeEdge";
    targetId?: string;
    node?: IVRNode;
    edge?: IVREdge;
    patch?: Record<string, unknown>;
  }> = [];

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [id, node] of candidateNodes) {
    const existing = currentNodes.get(id);
    if (!existing) {
      operations.push({ op: "addNode", targetId: id, node });
      added.push(id);
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(node)) {
      operations.push({
        op: "updateNode",
        targetId: id,
        node,
        patch: node.data ? { ...node.data } : undefined,
      });
      modified.push(id);
    }
  }

  for (const [id, node] of currentNodes) {
    if (!candidateNodes.has(id)) {
      operations.push({ op: "removeNode", targetId: id, node });
      removed.push(id);
    }
  }

  for (const [id, edge] of candidateEdges) {
    const existing = currentEdges.get(id);
    if (!existing) {
      operations.push({ op: "addEdge", targetId: id, edge });
      added.push(id);
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(edge)) {
      operations.push({
        op: "updateEdge",
        targetId: id,
        edge,
        patch: edge.data ? { ...edge.data } : undefined,
      });
      modified.push(id);
    }
  }

  for (const [id, edge] of currentEdges) {
    if (!candidateEdges.has(id)) {
      operations.push({ op: "removeEdge", targetId: id, edge });
      removed.push(id);
    }
  }

  return {
    operations,
    added: uniqueStrings(added),
    modified: uniqueStrings(modified),
    removed: uniqueStrings(removed),
  };
}

function deriveSuggestedTests(
  flow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  }
): string[] {
  const nodeKinds = new Set(
    flow.nodes.map(node => stringValue(node.data?.nodeKind)?.toUpperCase() ?? "")
  );
  const suggestions: string[] = [];

  if (nodeKinds.has("START")) {
    suggestions.push("Start the call and verify the entry node routes to the configured first step.");
  }

  if (nodeKinds.has("GREETING")) {
    suggestions.push("Validate that the greeting returns the expected speech text.");
  }

  if (nodeKinds.has("HYBRID_MENU") || nodeKinds.has("DTMF_MENU")) {
    suggestions.push("Press 1 and verify the hybrid menu follows the configured destination.");
    suggestions.push("Say a supported phrase and verify the voice route matches the DTMF route.");
  }

  if (nodeKinds.has("KNOWLEDGE")) {
    suggestions.push("Ask a knowledge question and confirm the approved knowledge scope is used.");
  }

  if (nodeKinds.has("ACTION")) {
    suggestions.push("Trigger the action node and confirm the approved action would execute.");
  }

  if (nodeKinds.has("CALLBACK")) {
    suggestions.push("Request a callback and verify the callback branch is selected.");
  }

  if (nodeKinds.has("HUMAN_TRANSFER") || nodeKinds.has("TRANSFER")) {
    suggestions.push("Request a human transfer and verify the destination branch is selected.");
  }

  if (nodeKinds.has("BUSINESS_HOURS")) {
    suggestions.push("Simulate open and closed hours to verify both transfer and callback paths.");
  }

  if (nodeKinds.has("AUTH_GATE")) {
    suggestions.push("Simulate an authentication failure and verify the fallback path remains safe.");
  }

  if (nodeKinds.has("END_CALL")) {
    suggestions.push("Verify that the end-call node returns final speech and terminates safely.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Run a basic DTMF simulation through the draft flow.");
  }

  return suggestions;
}

function collectMissingResources(
  context: FlowCopilotContext,
  flow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  }
): string[] {
  const missing = new Set<string>();

  for (const node of flow.nodes) {
    const nodeKind = stringValue(node.data?.nodeKind)?.toUpperCase() ?? "";

    if (
      (nodeKind === "KNOWLEDGE" || nodeKind === "AI" || nodeKind === "AI_CONVERSATION") &&
      toStringArray(node.data?.knowledgeDocumentIds ?? node.data?.knowledgeIds ?? node.data?.knowledge).length === 0
    ) {
      missing.add(`Node ${node.id} requires approved knowledge documents.`);
    }

    if (
      nodeKind === "ACTION" &&
      !stringValue(node.data?.actionCode)
    ) {
      missing.add(`Node ${node.id} requires a supported action code.`);
    }

    if (
      (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER") &&
      !stringValue(node.data?.transferDestinationId) &&
      !stringValue(node.data?.destinationId) &&
      !stringValue(node.data?.humanTransferDestinationId)
    ) {
      missing.add(`Node ${node.id} requires an authorized transfer destination.`);
    }

    if (
      nodeKind === "CALLBACK" &&
      !stringValue(node.data?.callbackConfigId) &&
      !stringValue(node.data?.callbackDestinationId)
    ) {
      missing.add(`Node ${node.id} requires a callback configuration.`);
    }

    if (
      nodeKind === "SEND_INFORMATION" &&
      !stringValue(node.data?.sendInformationTemplateId)
    ) {
      missing.add(`Node ${node.id} requires approved send-information content.`);
    }

    if (
      nodeKind === "BUSINESS_HOURS" &&
      !stringValue(node.data?.businessHoursPolicyId)
    ) {
      missing.add(`Node ${node.id} requires a business-hours policy.`);
    }

    if (
      nodeKind === "AUTH_GATE" &&
      !stringValue(node.data?.requiredAuthLevel) &&
      !stringValue(node.data?.minimumAuthLevel) &&
      !stringValue(node.data?.authLevel) &&
      !stringValue(node.data?.authenticationLevel)
    ) {
      missing.add(`Node ${node.id} requires an authentication threshold.`);
    }
  }

  return [...missing];
}

function buildFlowExplanation(
  flow: {
    nodes: IVRNode[];
    edges: IVREdge[];
  }
): string {
  const orderedNodes = flow.nodes.slice();
  const sections: string[] = [];
  const visited = new Set<string>();

  function describe(node: IVRNode | undefined): string | null {
    if (!node) {
      return null;
    }

    const kind = stringValue(node.data?.nodeKind)?.toUpperCase() ?? "NODE";
    const label = stringValue(node.data?.label) ?? node.id;
    const prompt = stringValue(node.data?.prompt) ?? stringValue(node.data?.greeting) ?? stringValue(node.data?.instruction) ?? stringValue(node.data?.question);
    const nextNodes = flow.edges.filter(edge => edge.source === node.id).map(edge => edge.target);

    switch (kind) {
      case "START":
        return `Start: ${label}. This is the call entry point and routes to ${nextNodes.join(", ") || "the next configured node"}.`;
      case "GREETING":
        return `Greeting: ${prompt || "Greets the caller."} It continues to ${nextNodes.join(", ") || "the next node"}.`;
      case "HYBRID_MENU":
      case "DTMF_MENU":
        return `Hybrid menu: ${prompt || "Presents a menu of DTMF and voice options."} Options are ${describeMenuOptions(node)}.`;
      case "KNOWLEDGE":
        return `Knowledge: ${prompt || "Answers using approved knowledge."} The flow keeps the response grounded in tenant-approved documents.`;
      case "ACTION":
        return `Action: ${prompt || "Performs an approved action."} It is configured to call ${stringValue(node.data?.actionCode) || "a supported action code"}.`;
      case "CONDITION":
        return `Condition: ${stringValue(node.data?.conditionExpression) || "Evaluates a routing expression."}`;
      case "BUSINESS_HOURS":
        return `Business hours: ${prompt || "Routes callers based on business hours."} The open and closed branches should be configured explicitly.`;
      case "AUTH_GATE":
        return `Authentication gate: ${prompt || "Requires the caller to pass an authentication step."}`;
      case "HUMAN_TRANSFER":
      case "TRANSFER":
        return `Human transfer: ${prompt || "Escalates the caller to a human destination."}`;
      case "CALLBACK":
        return `Callback: ${prompt || "Offers a callback path."}`;
      case "SEND_INFORMATION":
        return `Send information: ${prompt || "Sends approved information through the allowed channel."}`;
      case "AI":
      case "AI_CONVERSATION":
        return `AI conversation: ${prompt || "Handles a conversational exchange using the configured AI guidance."}`;
      case "END_CALL":
        return `End call: ${prompt || "Ends the call gracefully."}`;
      default:
        return `${label} (${kind}).`;
    }
  }

  for (const node of orderedNodes) {
    if (visited.has(node.id)) {
      continue;
    }

    visited.add(node.id);
    const description = describe(node);
    if (description) {
      sections.push(description);
    }
  }

  if (sections.length === 0) {
    return "No nodes were available to explain.";
  }

  return sections.join(" ");
}

function describeMenuOptions(node: IVRNode): string {
  const runtimeMenu = node.data?.runtimeMenu;
  const options = Array.isArray(node.data?.options)
      ? (node.data.options as Array<{ digit?: unknown; label?: unknown }>)
      : Array.isArray(node.data?.menuOptions)
        ? (node.data.menuOptions as Array<{ digit?: unknown; label?: unknown }>)
        : Array.isArray((runtimeMenu as { options?: unknown[] } | undefined)?.options)
          ? ((runtimeMenu as { options: Array<{ digit?: unknown; label?: unknown }> }).options)
          : [];

  if (options.length === 0) {
    return "the configured menu options";
  }

  return options
    .map(option => {
      const digit = stringValue(option.digit) ?? "?";
      const label = stringValue(option.label) ?? "option";
      return `${digit}: ${label}`;
    })
    .join(", ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeToken(value: unknown): string {
  return stringValue(value)?.toUpperCase() ?? "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function nodeKind(node: IVRNode): string {
  return stringValue(node.data?.nodeKind)?.toUpperCase() ?? "";
}

function voicePhrasesForMenuOption(label: string): string[] {
  const normalized = label.toLowerCase();

  if (normalized.includes("loan")) return ["loan", "loan information", "personal loan"];
  if (normalized.includes("eligib")) return ["eligibility", "am i eligible", "eligibility requirements"];
  if (normalized.includes("document") || normalized.includes("kyc")) return ["documents", "required documents", "kyc documents"];
  if (normalized.includes("agent") || normalized.includes("representative") || normalized.includes("transfer")) return ["agent", "human agent", "talk to agent", "representative"];
  if (normalized.includes("goodbye") || normalized.includes("exit") || normalized.includes("end")) return ["goodbye", "exit", "end call"];

  return [label];
}

function sanitizeCandidateResources(
  context: FlowCopilotContext,
  candidate: {
    nodes: IVRNode[];
    edges: IVREdge[];
  }
) {
  const authorization = context.resourceAuthorization;
  const allowedKnowledge = new Set(
    authorization?.allowedKnowledgeDocumentIds ?? context.knowledgeDocuments.map(document => document.id)
  );
  const allowedActions = new Set(
    authorization?.allowedActionCodes ?? context.availableActions
  );
  const allowedTransfers = new Set(
    authorization?.allowedTransferDestinationIds ?? context.transferDestinations.map(destination => destination.id)
  );
  const allowedCallbacks = new Set(
    authorization?.allowedCallbackDestinationIds ?? []
  );
  const allowedBusinessHours = new Set(
    authorization?.allowedBusinessHoursPolicyIds ?? []
  );
  const warnings: string[] = [];
  const removedNodeIds = new Set<string>();
  const nodes = candidate.nodes.map(node => ({
    ...node,
    data: { ...(node.data ?? {}) },
    position: { ...node.position },
  }));

  for (const node of nodes) {
    const kind = nodeKind(node);
    const data = node.data ?? {};

    if (kind === "CALLBACK" && allowedCallbacks.size === 0) {
      removedNodeIds.add(node.id);
      warnings.push("Callback was requested but no callback configuration exists. The generated flow uses a safe end-call fallback instead.");
      continue;
    }

    if (kind === "BUSINESS_HOURS" && allowedBusinessHours.size === 0) {
      removedNodeIds.add(node.id);
      warnings.push("Business-hours routing was requested but no business-hours policy exists. The generated flow routes directly to available supported steps instead.");
      continue;
    }

    if (kind === "ACTION" && !allowedActions.has(stringValue(data.actionCode) ?? "")) {
      removedNodeIds.add(node.id);
      warnings.push("An action was requested but no authorized action is available. The generated flow omits the action step.");
      continue;
    }

    if (kind === "HUMAN_TRANSFER" || kind === "TRANSFER") {
      if (allowedTransfers.size === 0) {
        removedNodeIds.add(node.id);
        warnings.push("Human transfer was requested but no authorized transfer destination exists. The generated flow uses a safe end-call fallback instead.");
        continue;
      }

      const destination = stringValue(data.transferDestinationId) ?? stringValue(data.transferDestination) ?? stringValue(data.destinationId) ?? stringValue(data.humanTransferDestinationId);
      if (!destination || !allowedTransfers.has(destination)) {
        data.transferDestinationId = [...allowedTransfers][0];
        warnings.push("The requested transfer destination was unavailable. The generated flow uses an authorized transfer destination instead.");
      }
      // `transferDestinationId` is the persisted graph contract. Older aliases
      // are accepted only while reading an AI response and are never emitted.
      data.transferDestinationId = stringValue(data.transferDestinationId) ?? destination ?? [...allowedTransfers][0];
      delete data.transferDestination;
      delete data.destinationId;
      delete data.humanTransferDestinationId;
    }

    if (kind === "KNOWLEDGE") {
      const approvedIds = toStringArray(data.knowledgeDocumentIds ?? data.knowledgeIds ?? data.knowledge)
        .filter(id => allowedKnowledge.has(id));
      if (allowedKnowledge.size === 0) {
        removedNodeIds.add(node.id);
        warnings.push("Knowledge was requested but no authorized knowledge document exists. The generated flow omits the knowledge step.");
        continue;
      }
      if (approvedIds.length === 0) {
        data.knowledgeDocumentIds = [[...allowedKnowledge][0]];
        delete data.knowledgeIds;
        warnings.push("An unavailable knowledge document was requested. The generated flow uses an authorized knowledge document instead.");
      } else {
        data.knowledgeDocumentIds = approvedIds;
        delete data.knowledgeIds;
      }
    }
  }

  let remainingNodes = nodes.filter(node => !removedNodeIds.has(node.id));
  let terminal = remainingNodes.find(node => nodeKind(node) === "END_CALL");
  if (!terminal) {
    terminal = {
      id: "copilot-safe-end",
      type: "ivr",
      position: { x: 1500, y: 240 },
      data: {
        nodeKind: "END_CALL",
        label: "Safe End",
        prompt: "All representatives are currently unavailable. Please contact us again later.",
      },
    } as IVRNode;
    remainingNodes = [...remainingNodes, terminal];
  }

  const knowledgeNode = remainingNodes.find(node => nodeKind(node) === "KNOWLEDGE");

  for (const node of remainingNodes) {
    const data = node.data ?? {};
    if (nodeKind(node) === "HYBRID_MENU" || nodeKind(node) === "DTMF_MENU") {
      const runtimeMenu = typeof data.runtimeMenu === "object" && data.runtimeMenu !== null
        ? { ...(data.runtimeMenu as unknown as Record<string, unknown>) }
        : null;
      const sourceOptions: unknown[] | null = Array.isArray(data.options)
        ? data.options
        : Array.isArray(data.menuOptions)
          ? data.menuOptions
          : Array.isArray(runtimeMenu?.options)
            ? runtimeMenu.options
            : null;
      if (sourceOptions) {
        data.options = sourceOptions.map(option => {
          if (!option || typeof option !== "object") return option;
          const optionData = { ...(option as Record<string, unknown>) };
          const digit = stringValue(optionData.digit) ?? stringValue(optionData.dtmf);
          if (digit) {
            optionData.digit = digit;
          }
          const destinationNodeId =
            stringValue(optionData.destinationNodeId) ??
            stringValue(optionData.targetNodeId) ??
            stringValue(optionData.destination) ??
            stringValue(optionData.target);
          if (destinationNodeId) {
            optionData.destinationNodeId = destinationNodeId;
          }
          // `dtmf` is accepted from AI and legacy drafts only. Newly generated
          // candidates persist the canonical `digit` field.
          delete optionData.dtmf;
          delete optionData.targetNodeId;
          delete optionData.destination;
          delete optionData.target;
          if (removedNodeIds.has(stringValue(optionData.destinationNodeId) ?? "")) {
            optionData.destinationNodeId = terminal.id;
          }
          const phrases = [
            ...toStringArray(optionData.voicePhrases),
            ...voicePhrasesForMenuOption(stringValue(optionData.label) ?? ""),
          ];
          optionData.voicePhrases = uniqueStrings(phrases);
          return optionData;
        }) as unknown as typeof data.options;
      }
      delete data.menuOptions;
      if (runtimeMenu) {
        delete runtimeMenu.options;
        data.runtimeMenu = runtimeMenu as unknown as typeof data.runtimeMenu;
      }

      if (nodeKind(node) === "HYBRID_MENU" && knowledgeNode) {
        data.allowNaturalLanguageEscape = true;
        data.escapeNodeId = knowledgeNode.id;
      }
    }
    if (removedNodeIds.has(stringValue(data.escapeNodeId) ?? "")) {
      data.escapeNodeId = terminal.id;
    }
  }

  let edges = candidate.edges
    .filter(edge => !removedNodeIds.has(edge.source))
    .map(edge => removedNodeIds.has(edge.target)
      ? { ...edge, target: terminal.id }
      : { ...edge, data: edge.data ? { ...edge.data } : undefined })
    .filter(edge => edge.source !== edge.target);

  for (const menuNode of remainingNodes.filter(node => ["HYBRID_MENU", "DTMF_MENU"].includes(nodeKind(node)))) {
    const data = menuNode.data ?? {};
    if (!Array.isArray(data.options)) continue;

    data.options = data.options.map(option => {
      if (!option || typeof option !== "object") return option;
      const normalizedOption = { ...(option as unknown as Record<string, unknown>) };
      const digit = stringValue(normalizedOption.digit) ?? stringValue(normalizedOption.dtmf);
      if (digit) {
        normalizedOption.digit = digit;
      }
      delete normalizedOption.dtmf;
      const canonicalDestination =
        stringValue(normalizedOption.destinationNodeId) ??
        stringValue(normalizedOption.targetNodeId) ??
        stringValue(normalizedOption.destination) ??
        stringValue(normalizedOption.target);
      if (canonicalDestination) {
        normalizedOption.destinationNodeId = canonicalDestination;
      }
      delete normalizedOption.targetNodeId;
      delete normalizedOption.destination;
      delete normalizedOption.target;
      const action = stringValue(normalizedOption.action);
      const destinationNodeId = stringValue(normalizedOption.destinationNodeId);
      const matchingEdge = edges.find(edge =>
        edge.source === menuNode.id &&
        ((digit !== null &&
          normalizeToken(edge.data?.trigger) === "DTMF" &&
          (stringValue(edge.sourceHandle) === digit ||
            stringValue(edge.data?.value) === digit)) ||
          (action !== null && normalizeToken(edge.data?.trigger) === normalizeToken(action)))
      );

      // The standard input router navigates by destinationNodeId and DTMF value;
      // action is a UI/analytics label, not a graph transition trigger.
      if (!destinationNodeId && matchingEdge) {
        normalizedOption.destinationNodeId = matchingEdge.target;
      }

      const target = stringValue(normalizedOption.destinationNodeId);
      const edge = target && digit
        ? edges.find(item =>
            item.source === menuNode.id &&
            normalizeToken(item.data?.trigger) === "DTMF" &&
            (stringValue(item.sourceHandle) === digit ||
              stringValue(item.data?.value) === digit)
          )
        : matchingEdge;
      if (edge && digit) {
        edge.sourceHandle = digit;
        edge.data = { ...(edge.data ?? {}), trigger: "DTMF", value: digit };
      }

      return normalizedOption;
    }) as unknown as typeof data.options;
  }

  const menu = remainingNodes.find(node => nodeKind(node) === "HYBRID_MENU" || nodeKind(node) === "DTMF_MENU");
  if (menu) {
    for (const knowledge of remainingNodes.filter(node => nodeKind(node) === "KNOWLEDGE")) {
      edges = edges.filter(edge => edge.source !== knowledge.id);
      edges.push(
        { id: `${knowledge.id}-to-menu`, source: knowledge.id, target: menu.id, type: "smoothstep", data: { trigger: "KNOWLEDGE_FOUND" } } as IVREdge,
        { id: `${knowledge.id}-no-knowledge-to-menu`, source: knowledge.id, target: menu.id, type: "smoothstep", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } } as IVREdge
      );
    }
  }

  for (const transfer of remainingNodes.filter(node => ["HUMAN_TRANSFER", "TRANSFER"].includes(nodeKind(node)))) {
    const transferEdges = edges.filter(edge => edge.source === transfer.id);
    const hasHandle = (edge: IVREdge, value: string) =>
      normalizeToken(edge.sourceHandle) === value;
    const successEdge = transferEdges.find(edge =>
      normalizeToken(edge.data?.trigger) === "HUMAN_TRANSFER" && !edge.sourceHandle
    ) ?? transferEdges.find(edge =>
      ["HUMAN_TRANSFER", "SUCCESS", "DEFAULT", "TRANSFER_COMPLETE"].includes(normalizeToken(edge.data?.trigger)) ||
      hasHandle(edge, "SUCCESS")
    );
    const failureEdge = transferEdges.find(edge =>
      normalizeToken(edge.data?.trigger) === "ACTION_FAILURE" && !edge.sourceHandle
    ) ?? transferEdges.find(edge =>
      ["ACTION_FAILURE", "FAILURE", "TRANSFER_FAILED", "UNAVAILABLE", "HUMAN_TRANSFER_UNAVAILABLE"].includes(normalizeToken(edge.data?.trigger)) ||
      hasHandle(edge, "FAILURE")
    );

    const isOutcomeAlias = (edge: IVREdge) =>
      [
        "HUMAN_TRANSFER",
        "SUCCESS",
        "DEFAULT",
        "TRANSFER_COMPLETE",
        "ACTION_FAILURE",
        "FAILURE",
        "TRANSFER_FAILED",
        "UNAVAILABLE",
        "HUMAN_TRANSFER_UNAVAILABLE",
      ].includes(normalizeToken(edge.data?.trigger)) ||
      hasHandle(edge, "SUCCESS") ||
      hasHandle(edge, "FAILURE");

    // The executor recognizes exactly these two transfer outcomes.  Remove
    // generated handle/trigger aliases and rebuild one route for each.
    edges = edges.filter(edge => edge.source !== transfer.id || !isOutcomeAlias(edge));
    edges.push({
      ...(successEdge ?? {}),
      id: successEdge?.id ?? `${transfer.id}-success-to-end`,
      source: transfer.id,
      target: successEdge?.target ?? terminal.id,
      type: successEdge?.type ?? "smoothstep",
      sourceHandle: undefined,
      data: { ...(successEdge?.data ?? {}), trigger: "HUMAN_TRANSFER" },
    } as IVREdge, {
      ...(failureEdge ?? {}),
      id: failureEdge?.id ?? `${transfer.id}-failure-to-end`,
      source: transfer.id,
      target: failureEdge?.target ?? terminal.id,
      type: failureEdge?.type ?? "smoothstep",
      sourceHandle: undefined,
      data: { ...(failureEdge?.data ?? {}), trigger: "ACTION_FAILURE" },
    } as IVREdge);
  }

  const normalizedRouting = normalizeIVRMenuRouting({
    nodes: remainingNodes as Array<IVRNode & Record<string, unknown>>,
    edges: edges as Array<IVREdge & Record<string, unknown>>,
  });

  return {
    flow: {
      nodes: normalizedRouting.nodes as IVRNode[],
      edges: normalizedRouting.edges as IVREdge[],
    },
    warnings: uniqueStrings(warnings),
  };
}

function enrichSuggestion(
  context: FlowCopilotContext,
  suggestion: z.infer<typeof FlowCopilotResponseSchema>
) {
  const candidateFlow = suggestion.candidateFlow
    ? cloneFlow({
        name: suggestion.candidateFlow.name ?? context.flowName,
        description: suggestion.candidateFlow.description,
        nodes: suggestion.candidateFlow.nodes as IVRNode[],
        edges: suggestion.candidateFlow.edges as IVREdge[],
        metadata: suggestion.candidateFlow.metadata as Record<string, unknown> | undefined,
      })
    : context.mode === "EXPLAIN" || context.mode === "VALIDATE"
      ? undefined
      : cloneFlow({
          name: context.flowName,
          nodes: context.currentFlow.nodes,
          edges: context.currentFlow.edges,
        });

  let resolvedCandidateFlow = candidateFlow;
  if (context.mode === "MODIFY" && suggestion.candidatePatch) {
    try {
      resolvedCandidateFlow = applyFlowCopilotPatch(
        context.currentFlow,
        suggestion.candidatePatch as Parameters<typeof applyFlowCopilotPatch>[1]
      );
    } catch (error) {
      throw new AppError(
        "IVR copilot returned an invalid patch. The current draft was not changed.",
        422,
        "COPILOT_INVALID_PATCH",
        error instanceof Error ? { message: error.message } : undefined
      );
    }
  }

  const sanitization = resolvedCandidateFlow && ["GENERATE", "MODIFY", "REPAIR"].includes(context.mode)
    ? sanitizeCandidateResources(context, resolvedCandidateFlow)
    : null;
  resolvedCandidateFlow = sanitization?.flow ?? resolvedCandidateFlow;

  const candidatePatch =
    resolvedCandidateFlow && context.mode !== "EXPLAIN" && context.mode !== "VALIDATE"
      ? buildFlowPatchPreview(context.currentFlow, resolvedCandidateFlow)
      : suggestion.candidatePatch;

  const validation = buildValidationSnapshot(
    resolvedCandidateFlow ?? context.currentFlow,
    context.resourceAuthorization,
    context.supportedNodeKinds
  );

  const missingResources = uniqueStrings([
    ...(context.mode === "EXPLAIN" || context.mode === "VALIDATE"
      ? ((suggestion.missingResources ?? []) as string[])
      : []),
    ...collectMissingResources(context, resolvedCandidateFlow ?? context.currentFlow),
  ]);

  const suggestedTests = uniqueStrings([
    ...((suggestion.suggestedTests ?? []) as string[]),
    ...deriveSuggestedTests(resolvedCandidateFlow ?? context.currentFlow),
  ]);

  const assumptions = uniqueStrings([
    ...((suggestion.assumptions ?? []) as string[]),
    ...(context.mode === "EXPLAIN"
      ? ["This is informational only and does not mutate the flow."]
      : ["This candidate must pass deterministic validation before it can be published."]),
  ]);

  const warnings = uniqueStrings([
    ...((suggestion.warnings ?? []) as string[]),
    ...(sanitization?.warnings ?? []),
    ...(context.resourceWarnings ?? []),
    ...missingResources,
  ]);

  const summary =
    context.mode === "EXPLAIN"
      ? buildFlowExplanation(resolvedCandidateFlow ?? context.currentFlow)
      : context.mode === "VALIDATE"
        ? validation.valid
          ? "The current flow passed deterministic validation."
          : `Validation found ${validation.errors.length} error(s) and ${validation.warnings.length} warning(s).`
        : suggestion.summary;

  log.info({
    event: "ivr.copilot.candidate_normalized",
    mode: context.mode,
    candidateNodeCount: resolvedCandidateFlow?.nodes.length ?? 0,
    candidateEdgeCount: resolvedCandidateFlow?.edges.length ?? 0,
    deterministicValidationValid: validation.valid,
    deterministicValidationErrorCodes: validation.errors.map(issue => issue.code),
    missingResourceCount: missingResources.length,
  }, "IVR copilot candidate normalized");

  return {
    ...suggestion,
    summary,
    warnings,
    assumptions,
    missingResources,
    suggestedTests,
    candidateFlow: resolvedCandidateFlow,
    candidatePatch,
    validation,
  };
}

export async function buildFlowCopilotSuggestion(
  context: FlowCopilotContext
) {
  const isDemoBankPersonalLoanRequest = context.mode === "GENERATE"
    && /demobank/.test(context.prompt.toLowerCase())
    && /personal loan|loan information|eligibility|kyc|documents/.test(context.prompt.toLowerCase())
    && context.currentFlow.nodes.some(node => nodeKind(node) === "START");
  if (isDemoBankPersonalLoanRequest) {
    const suggestion = buildPersonalLoanMenuSuggestion(context);
    if (suggestion) {
      log.info({
        event: "ivr.copilot.deterministic_candidate_selected",
        mode: context.mode,
        currentNodeCount: context.currentFlow.nodes.length,
        currentEdgeCount: context.currentFlow.edges.length,
        candidateNodeCount: suggestion.candidateFlow.nodes.length,
        candidateEdgeCount: suggestion.candidateFlow.edges.length,
      }, "Selected the authorized DemoBank candidate");
      return enrichSuggestion(context, suggestion);
    }
  }

  const prompt = [
    "You are an IVR flow copilot.",
    "Return JSON only.",
    "Return structured JSON with summary, warnings, assumptions, missingResources, suggestedTests, candidateFlow, candidatePatch, and validation when relevant.",
    "Use only supported node kinds, actions, and transfer destinations.",
    "Never invent cross-tenant data or unsupported capabilities.",
    "Do not emit CALLBACK when no callback configuration is listed, BUSINESS_HOURS when no policy is listed, ACTION when no action is listed, HUMAN_TRANSFER without a listed destination, or KNOWLEDGE without a listed document.",
    "When a requested resource is unavailable, use a safe END_CALL fallback and explain it in warnings; do not return an executable placeholder.",
    "",
    `Mode: ${context.mode}`,
    `Flow name: ${context.flowName}`,
    `Supported node kinds: ${context.supportedNodeKinds.join(", ")}`,
    `Available actions: ${context.availableActions.join(", ") || "none"}`,
    `Transfer destinations: ${context.transferDestinations.map(destination => `${destination.id}:${destination.label}`).join(", ") || "none"}`,
    `Knowledge documents: ${context.knowledgeDocuments.map(doc => `${doc.id}:${doc.name}`).join(", ") || "none"}`,
    `Approved message templates: ${context.approvedMessageTemplates?.map(template => `${template.id}:${template.label}`).join(", ") || "none"}`,
    `Inbound profiles: ${context.inboundProfiles?.map(profile => profile.label).join(", ") || "none"}`,
    `Campaigns: ${context.campaigns?.map(campaign => campaign.label).join(", ") || "none"}`,
    `Resource warnings: ${context.resourceWarnings?.join(" | ") || "none"}`,
    context.validation
      ? `Deterministic validation summary: ${context.validation.valid ? "valid" : "invalid"}`
      : "Deterministic validation summary: not provided",
    "",
    "Current flow JSON:",
    JSON.stringify(context.currentFlow, null, 2),
    "",
    "User instruction:",
    context.prompt,
    "",
    "Return an object with summary, warnings, and candidateFlow.",
  ].join("\n");

  let raw: string;

  try {
    log.info({
      event: "ivr.copilot.model_call_started",
      mode: context.mode,
      currentNodeCount: context.currentFlow.nodes.length,
      currentEdgeCount: context.currentFlow.edges.length,
    }, "IVR copilot model call started");
    raw = await generateAIResponse(prompt);
    log.info({
      event: "ivr.copilot.model_call_completed",
      mode: context.mode,
      responseLength: raw.length,
    }, "IVR copilot model call completed");
  } catch {
    // Provider unavailability falls back to a deterministic local proposal.
    log.warn({ event: "ivr.copilot.model_call_failed", mode: context.mode }, "Using local IVR copilot fallback");
    return enrichSuggestion(context, buildHeuristicSuggestion(context));
  }

  const extracted = extractJsonBlock(raw);
  if (!extracted) {
    log.warn({ event: "ivr.copilot.model_parse_failed", mode: context.mode, responseLength: raw.length }, "No JSON object found in IVR copilot response");
    throw new AppError(
      "IVR copilot returned a malformed response. The current draft was not changed.",
      422,
      "COPILOT_MALFORMED_RESPONSE"
    );
  }

  let parsed: z.infer<typeof FlowCopilotResponseSchema>;
  try {
    parsed = FlowCopilotResponseSchema.parse(normalizeModelResponseContract(JSON.parse(extracted)));
    log.info({
      event: "ivr.copilot.model_parse_succeeded",
      mode: context.mode,
      candidateNodeCount: parsed.candidateFlow?.nodes.length ?? 0,
      candidateEdgeCount: parsed.candidateFlow?.edges.length ?? 0,
    }, "IVR copilot response parsed");
  } catch (error) {
    log.warn({ event: "ivr.copilot.model_candidate_invalid", mode: context.mode }, "IVR copilot JSON did not match the candidate contract");
    throw new AppError(
      "IVR copilot returned an invalid structured candidate. The current draft was not changed.",
      422,
      "COPILOT_INVALID_CANDIDATE",
      error instanceof z.ZodError ? error.flatten() : undefined
    );
  }

  if (
    ["GENERATE", "MODIFY", "REPAIR"].includes(context.mode) &&
    !parsed.candidateFlow
  ) {
    throw new AppError(
      "IVR copilot did not include a candidate flow. The current draft was not changed.",
      422,
      "COPILOT_CANDIDATE_REQUIRED"
    );
  }

  return enrichSuggestion(context, parsed);
}
