import { validateIVRFlowDefinition, type IVRFlowValidationResult } from "./ivr-flow-validator.service";
import { routeStandardInput } from "./standard-input-router.service";

type Node = {
  id: string;
  data?: Record<string, unknown>;
};

type Edge = {
  source: string;
  target: string;
  data?: Record<string, unknown>;
};

export type IVRSimulationInputMode = "DTMF" | "VOICE" | "SILENCE";

export interface IVRSimulationInput {
  nodes: unknown[];
  edges: unknown[];
  currentNodeId?: string | null;
  startNodeId?: string | null;
  inputMode: IVRSimulationInputMode;
  input: string;
  tenantId?: string | null;
}

export interface IVRSimulationResult {
  validation: IVRFlowValidationResult;
  currentNodeId: string | null;
  matchedOption: string | null;
  confidence: number;
  transition: string | null;
  resultingNodeId: string | null;
  actionWouldExecute: string | null;
  responsePreview: string | null;
  knowledgeScopeSummary: string | null;
  warnings: string[];
  trace: string[];
}

export function simulateIVRFlow(
  input: IVRSimulationInput
): IVRSimulationResult {
  const validation = validateIVRFlowDefinition({
    nodes: input.nodes,
    edges: input.edges,
    tenantId: input.tenantId ?? null,
  });

  const nodes = normalizeNodes(input.nodes);
  const edges = normalizeEdges(input.edges);
  const warnings = [...validation.warnings.map(issue => issue.message)];

  const start = nodes.find(node => kind(node) === "START");
  const initialNodeId = input.currentNodeId?.trim() || input.startNodeId?.trim() || start?.id || null;

  if (!initialNodeId) {
    return {
      validation,
      currentNodeId: null,
      matchedOption: null,
      confidence: 0,
      transition: null,
      resultingNodeId: null,
      actionWouldExecute: null,
      responsePreview: null,
      knowledgeScopeSummary: null,
      warnings: [...warnings, "No starting node was available for simulation."],
      trace: ["Simulation could not resolve a START node."],
    };
  }

  const initialNode = nodes.find(node => node.id === initialNodeId) ?? null;
  const routedNode = advanceToInteractiveNode(initialNode, nodes, edges);

  const route = input.inputMode === "SILENCE"
    ? {
        matched: false,
        confidence: 0,
        resultingNodeId: null,
        transition: "SILENCE",
        action: "CLARIFY" as const,
        optionLabel: null,
      }
    : routeStandardInput({
        nodes,
        edges,
        currentNodeId: routedNode?.id ?? initialNodeId,
        inputMode: input.inputMode,
        rawInput: input.input,
      });

  const currentNode = routedNode ?? initialNode;
  const resultingNodeId = route.resultingNodeId ?? routedNode?.id ?? initialNodeId;
  const resultingNode = nodes.find(node => node.id === resultingNodeId) ?? currentNode;

  if (!resultingNode) {
    return {
      validation,
      currentNodeId: initialNodeId,
      matchedOption: route.optionLabel,
      confidence: route.confidence,
      transition: route.transition,
      resultingNodeId: null,
      actionWouldExecute: null,
      responsePreview: null,
      knowledgeScopeSummary: null,
      warnings: [...warnings, "Simulation could not resolve the resulting node."],
      trace: [`Current node: ${initialNodeId}`, "Simulation did not resolve a destination node."],
    };
  }

  const preview = previewNodePath(resultingNode, nodes, edges);

  return {
    validation,
    currentNodeId: initialNodeId,
    matchedOption: route.optionLabel,
    confidence: route.confidence,
    transition: route.transition,
    resultingNodeId: preview.resultingNodeId,
    actionWouldExecute: preview.actionWouldExecute,
    responsePreview: preview.responsePreview,
    knowledgeScopeSummary: preview.knowledgeScopeSummary,
    warnings: [...warnings, ...preview.warnings],
    trace: [
      `Current node: ${initialNodeId}`,
      `Input: ${input.inputMode}${input.input ? ` (${input.input})` : ""}`,
      `Transition: ${route.transition ?? "none"}`,
      `Resulting node: ${preview.resultingNodeId ?? "none"}`,
      ...(preview.actionWouldExecute ? [`Action would execute: ${preview.actionWouldExecute}`] : []),
    ],
  };
}

function previewNodePath(
  node: Node,
  nodes: Node[],
  edges: Edge[]
): {
  resultingNodeId: string | null;
  actionWouldExecute: string | null;
  responsePreview: string | null;
  knowledgeScopeSummary: string | null;
  warnings: string[];
} {
  let current = node;
  const warnings: string[] = [];
  let responsePreview: string | null = null;
  let actionWouldExecute: string | null = null;
  let knowledgeScopeSummary: string | null = null;

  for (let step = 0; step < 8; step += 1) {
    const nodeKind = kind(current);
    const prompt =
      stringValue(current.data?.prompt) ??
      stringValue(current.data?.greeting) ??
      stringValue(current.data?.question) ??
      stringValue(current.data?.topic) ??
      stringValue(current.data?.instruction) ??
      stringValue(current.data?.query);

    if (!responsePreview && prompt) {
      responsePreview = prompt;
    }

    if (nodeKind === "END_CALL") {
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt,
        knowledgeScopeSummary,
        warnings,
      };
    }

    if (nodeKind === "HYBRID_MENU" || nodeKind === "DTMF_MENU" || nodeKind === "AI" || nodeKind === "AI_CONVERSATION") {
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt,
        knowledgeScopeSummary,
        warnings,
      };
    }

    if (nodeKind === "KNOWLEDGE") {
      knowledgeScopeSummary = summarizeKnowledge(current);
      actionWouldExecute = "KNOWLEDGE_LOOKUP";
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt ?? "Knowledge preview",
        knowledgeScopeSummary,
        warnings,
      };
    }

    if (nodeKind === "ACTION") {
      actionWouldExecute = stringValue(current.data?.actionCode) ?? "ACTION";
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt ?? "Action preview",
        knowledgeScopeSummary,
        warnings,
      };
    }

    if (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER") {
      actionWouldExecute = "HUMAN_TRANSFER";
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt ?? "Transfer preview",
        knowledgeScopeSummary,
        warnings,
      };
    }

    if (nodeKind === "CALLBACK") {
      actionWouldExecute = "CALLBACK";
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt ?? "Callback preview",
        knowledgeScopeSummary,
        warnings,
      };
    }

    const nextEdge = edges.find(edge => edge.source === current.id && normalizeToken(edge.data?.trigger) === "DEFAULT") ?? edges.find(edge => edge.source === current.id);
    if (!nextEdge) {
      warnings.push(`No outgoing transition was available from node ${current.id}.`);
      return {
        resultingNodeId: current.id,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt,
        knowledgeScopeSummary,
        warnings,
      };
    }

    const nextNode = nodes.find(candidate => candidate.id === nextEdge.target) ?? null;
    if (!nextNode) {
      warnings.push(`Simulation target node ${nextEdge.target} was not found.`);
      return {
        resultingNodeId: nextEdge.target,
        actionWouldExecute,
        responsePreview: responsePreview ?? prompt,
        knowledgeScopeSummary,
        warnings,
      };
    }

    current = nextNode;
  }

  warnings.push("Simulation stopped after reaching the automatic traversal limit.");
  return {
    resultingNodeId: current.id,
    actionWouldExecute,
    responsePreview,
    knowledgeScopeSummary,
    warnings,
  };
}

function advanceToInteractiveNode(
  node: Node | null,
  nodes: Node[],
  edges: Edge[]
): Node | null {
  let current = node;

  for (let step = 0; step < 8 && current; step += 1) {
    const activeCurrent = current;
    const nodeKind = kind(activeCurrent);
    if (!["START", "GREETING", "CONDITION", "BUSINESS_HOURS", "AUTH_GATE", "SEND_INFORMATION"].includes(nodeKind)) {
      return current;
    }

    const nextEdge = edges.find(edge => edge.source === activeCurrent.id && normalizeToken(edge.data?.trigger) === "DEFAULT") ?? edges.find(edge => edge.source === activeCurrent.id);
    if (!nextEdge) {
      return current;
    }

    current = nodes.find(candidate => candidate.id === nextEdge.target) ?? null;
  }

  return current;
}

function summarizeKnowledge(node: Node): string {
  const ids = toStringArray(
    node.data?.knowledgeDocumentIds ??
      node.data?.knowledgeIds ??
      node.data?.knowledge
  );

  if (ids.length === 0) {
    return "No knowledge documents attached.";
  }

  return `${ids.length} approved knowledge document(s): ${ids.join(", ")}`;
}

function normalizeNodes(value: unknown): Node[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map(node => ({
      id: stringValue(node.id) ?? "",
      data: isRecord(node.data) ? sanitizeRecord(node.data) : undefined,
    }))
    .filter(node => Boolean(node.id));
}

function normalizeEdges(value: unknown): Edge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map(edge => ({
      source: stringValue(edge.source) ?? "",
      target: stringValue(edge.target) ?? "",
      data: isRecord(edge.data) ? sanitizeRecord(edge.data) : undefined,
    }))
    .filter(edge => Boolean(edge.source) && Boolean(edge.target));
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      record[key] = raw;
      continue;
    }
    if (Array.isArray(raw)) {
      record[key] = raw.map(item =>
        isRecord(item)
          ? sanitizeRecord(item)
          : item
      );
      continue;
    }
    if (isRecord(raw)) {
      record[key] = sanitizeRecord(raw);
    }
  }
  return record;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (isRecord(item) && typeof item.id === "string") {
        return item.id.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function kind(node: Node): string {
  return stringValue(node.data?.nodeKind)?.toUpperCase() ?? "";
}

function normalizeToken(value: unknown): string {
  return stringValue(value)?.toUpperCase() ?? "";
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
