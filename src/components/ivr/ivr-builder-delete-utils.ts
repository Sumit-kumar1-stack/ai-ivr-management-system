import type {
  IVREdge,
  IVRNode,
  IVRNodeData,
  IVRNodeKind,
  IVRRuntimeMenuOption,
} from "./types";

/**
 * References stored in node configuration are intentionally reported
 * separately from React Flow edges.  This makes destructive changes
 * explainable before they are applied, while keeping the graph model as the
 * single source of truth.
 */
export type IvrNodeDeletionReference = {
  sourceNodeId: string;
  sourceNodeLabel: string;
  field:
    | "fallbackNodeId"
    | "escapeNodeId"
    | "nextNodeId"
    | "defaultAiNodeId"
    | "options.destinationNodeId"
    | "runtimeMenu.options.destinationNodeId";
  optionDigit?: string;
};

export type IvrNodeDeletionImportance =
  | "FLOW_ENTRY"
  | "AUTHENTICATION"
  | "BUSINESS_TOOL"
  | "AGENT_TRANSFER"
  | "CALLBACK"
  | "ROUTING_BRIDGE"
  | "START_REACHABILITY"
  | "ONLY_TERMINAL";

export type IvrNodeDeletionBlockedReason =
  | "NODE_NOT_FOUND"
  | "START_NODE"
  | "READ_ONLY";

export interface IvrNodeDeletionImpact {
  nodeId: string;
  nodeLabel: string;
  nodeKind: IVRNodeKind | null;
  exists: boolean;
  canDelete: boolean;
  isProtected: boolean;
  blockedReason: IvrNodeDeletionBlockedReason | null;
  incomingEdges: IVREdge[];
  outgoingEdges: IVREdge[];
  attachedEdgeIds: string[];
  fallbackReferences: IvrNodeDeletionReference[];
  routeTargetReferences: IvrNodeDeletionReference[];
  /** Existing START-reachable nodes that would be disconnected by deletion. */
  startReachabilityImpact: {
    affectedNodeIds: string[];
    affectedCount: number;
  };
  importance: IvrNodeDeletionImportance[];
  isStructurallyImportant: boolean;
  requiresConfirmation: boolean;
}

export interface DeleteIvrNodeOptions {
  /** Pass false for published or otherwise read-only flow versions. */
  isEditable?: boolean;
}

export interface IvrNodeDeletionResult {
  deleted: boolean;
  impact: IvrNodeDeletionImpact;
  nodes: IVRNode[];
  edges: IVREdge[];
}

const FALLBACK_REFERENCE_FIELDS = ["fallbackNodeId", "escapeNodeId"] as const;
const ROUTE_REFERENCE_FIELDS = ["nextNodeId", "defaultAiNodeId"] as const;

/**
 * Computes a deterministic, non-mutating deletion preview.  The preview is
 * also used by the cleanup operation so what is confirmed is exactly what is
 * removed.
 */
export function analyzeIvrNodeDeletion(
  nodes: IVRNode[],
  edges: IVREdge[],
  nodeId: string,
  options: DeleteIvrNodeOptions = {}
): IvrNodeDeletionImpact {
  const node = nodes.find(candidate => candidate.id === nodeId);
  const isEditable = options.isEditable ?? true;

  if (!node) {
    return emptyImpact(nodeId, "NODE_NOT_FOUND");
  }

  const nodeKind = normalizeKind(node.data.nodeKind);
  const isStart = nodeKind === "START";
  const incomingEdges = edges.filter(edge => edge.target === nodeId);
  const outgoingEdges = edges.filter(edge => edge.source === nodeId);
  const references = findNodeReferences(nodes, nodeId);
  const fallbackReferences = references.filter(reference =>
    reference.field === "fallbackNodeId" || reference.field === "escapeNodeId"
  );
  const routeTargetReferences = references.filter(reference =>
    reference.field !== "fallbackNodeId" && reference.field !== "escapeNodeId"
  );
  const startReachabilityImpact = findStartReachabilityImpact(nodes, edges, nodeId);
  const importance = findImportance({
    nodeKind,
    incomingEdges,
    outgoingEdges,
    startReachabilityImpact,
    nodes,
  });

  const blockedReason: IvrNodeDeletionBlockedReason | null = !isEditable
    ? "READ_ONLY"
    : isStart
      ? "START_NODE"
      : null;
  const attachedEdgeIds = [...incomingEdges, ...outgoingEdges]
    .map(edge => edge.id)
    .filter((edgeId, index, all) => all.indexOf(edgeId) === index);
  const isStructurallyImportant = importance.some(value =>
    ["FLOW_ENTRY", "ROUTING_BRIDGE", "START_REACHABILITY", "ONLY_TERMINAL"].includes(value)
  );

  return {
    nodeId,
    nodeLabel: node.data.label?.trim() || nodeId,
    nodeKind,
    exists: true,
    canDelete: blockedReason === null,
    isProtected: blockedReason !== null,
    blockedReason,
    incomingEdges,
    outgoingEdges,
    attachedEdgeIds,
    fallbackReferences,
    routeTargetReferences,
    startReachabilityImpact,
    importance,
    isStructurallyImportant,
    requiresConfirmation:
      attachedEdgeIds.length > 0 ||
      references.length > 0 ||
      importance.length > 0,
  };
}

/**
 * Removes one editable non-START node and every graph/configuration reference
 * that would otherwise point to it.  It never mutates its input arrays or
 * nodes, so a draft-history snapshot can restore the complete graph on undo.
 */
export function deleteIvrNodeWithCleanup(
  nodes: IVRNode[],
  edges: IVREdge[],
  nodeId: string,
  options: DeleteIvrNodeOptions = {}
): IvrNodeDeletionResult {
  const impact = analyzeIvrNodeDeletion(nodes, edges, nodeId, options);

  if (!impact.canDelete) {
    return {
      deleted: false,
      impact,
      nodes,
      edges,
    };
  }

  const nextNodes = nodes
    .filter(node => node.id !== nodeId)
    .map(node => clearDeletedNodeReferences(node, nodeId));
  const remainingNodeIds = new Set(nextNodes.map(node => node.id));
  const nextEdges = edges.filter(edge =>
    edge.source !== nodeId &&
    edge.target !== nodeId &&
    remainingNodeIds.has(edge.source) &&
    remainingNodeIds.has(edge.target)
  );

  return {
    deleted: true,
    impact,
    nodes: nextNodes,
    edges: nextEdges,
  };
}

function emptyImpact(nodeId: string, blockedReason: IvrNodeDeletionBlockedReason): IvrNodeDeletionImpact {
  return {
    nodeId,
    nodeLabel: nodeId,
    nodeKind: null,
    exists: false,
    canDelete: false,
    isProtected: true,
    blockedReason,
    incomingEdges: [],
    outgoingEdges: [],
    attachedEdgeIds: [],
    fallbackReferences: [],
    routeTargetReferences: [],
    startReachabilityImpact: { affectedNodeIds: [], affectedCount: 0 },
    importance: [],
    isStructurallyImportant: false,
    requiresConfirmation: false,
  };
}

function findNodeReferences(nodes: IVRNode[], targetNodeId: string): IvrNodeDeletionReference[] {
  const references: IvrNodeDeletionReference[] = [];

  for (const node of nodes) {
    if (node.id === targetNodeId) {
      continue;
    }

    const sourceNodeLabel = node.data.label?.trim() || node.id;
    for (const field of FALLBACK_REFERENCE_FIELDS) {
      if (node.data[field] === targetNodeId) {
        references.push({ sourceNodeId: node.id, sourceNodeLabel, field });
      }
    }
    for (const field of ROUTE_REFERENCE_FIELDS) {
      if (node.data[field] === targetNodeId) {
        references.push({ sourceNodeId: node.id, sourceNodeLabel, field });
      }
    }
    appendOptionReferences(
      references,
      node.id,
      sourceNodeLabel,
      node.data.options,
      "options.destinationNodeId",
      targetNodeId
    );
    appendOptionReferences(
      references,
      node.id,
      sourceNodeLabel,
      node.data.runtimeMenu?.options,
      "runtimeMenu.options.destinationNodeId",
      targetNodeId
    );
  }

  return references;
}

function appendOptionReferences(
  references: IvrNodeDeletionReference[],
  sourceNodeId: string,
  sourceNodeLabel: string,
  options: IVRRuntimeMenuOption[] | undefined,
  field: "options.destinationNodeId" | "runtimeMenu.options.destinationNodeId",
  targetNodeId: string
): void {
  options?.forEach(option => {
    if (option.destinationNodeId === targetNodeId) {
      references.push({
        sourceNodeId,
        sourceNodeLabel,
        field,
        optionDigit: option.digit,
      });
    }
  });
}

function findStartReachabilityImpact(
  nodes: IVRNode[],
  edges: IVREdge[],
  deletedNodeId: string
): IvrNodeDeletionImpact["startReachabilityImpact"] {
  const before = reachableFromStart(nodes, edges);
  const remainingNodes = nodes.filter(node => node.id !== deletedNodeId);
  const remainingEdges = edges.filter(edge =>
    edge.source !== deletedNodeId && edge.target !== deletedNodeId
  );
  const after = reachableFromStart(remainingNodes, remainingEdges);
  const affectedNodeIds = [...before]
    .filter(nodeId => nodeId !== deletedNodeId && !after.has(nodeId))
    .sort();

  return {
    affectedNodeIds,
    affectedCount: affectedNodeIds.length,
  };
}

function reachableFromStart(nodes: IVRNode[], edges: IVREdge[]): Set<string> {
  const startNodes = nodes.filter(node => normalizeKind(node.data.nodeKind) === "START");
  const reachable = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  const stack = startNodes.map(node => node.id);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const target of adjacency.get(current) ?? []) {
      if (!reachable.has(target)) {
        stack.push(target);
      }
    }
  }

  return reachable;
}

function findImportance(input: {
  nodeKind: IVRNodeKind | null;
  incomingEdges: IVREdge[];
  outgoingEdges: IVREdge[];
  startReachabilityImpact: IvrNodeDeletionImpact["startReachabilityImpact"];
  nodes: IVRNode[];
}): IvrNodeDeletionImportance[] {
  const importance: IvrNodeDeletionImportance[] = [];
  const nodeKind = input.nodeKind;

  if (nodeKind === "START") importance.push("FLOW_ENTRY");
  if (nodeKind === "AUTH_GATE") importance.push("AUTHENTICATION");
  if (nodeKind === "ACTION" || nodeKind === "SEND_INFORMATION") importance.push("BUSINESS_TOOL");
  if (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER") importance.push("AGENT_TRANSFER");
  if (nodeKind === "CALLBACK") importance.push("CALLBACK");
  if (input.incomingEdges.length > 0 && input.outgoingEdges.length > 0) importance.push("ROUTING_BRIDGE");
  if (input.startReachabilityImpact.affectedCount > 0) importance.push("START_REACHABILITY");
  if (
    nodeKind === "END_CALL" &&
    input.nodes.filter(node => normalizeKind(node.data.nodeKind) === "END_CALL").length === 1
  ) {
    importance.push("ONLY_TERMINAL");
  }

  return importance;
}

function clearDeletedNodeReferences(node: IVRNode, deletedNodeId: string): IVRNode {
  let changed = false;
  const data: IVRNodeData = { ...node.data };

  for (const field of [...FALLBACK_REFERENCE_FIELDS, ...ROUTE_REFERENCE_FIELDS]) {
    if (data[field] === deletedNodeId) {
      delete data[field];
      changed = true;
    }
  }

  const cleanedOptions = clearOptionReferences(data.options, deletedNodeId);
  if (cleanedOptions !== data.options) {
    data.options = cleanedOptions;
    changed = true;
  }

  const runtimeOptions = clearOptionReferences(data.runtimeMenu?.options, deletedNodeId);
  if (runtimeOptions !== data.runtimeMenu?.options && data.runtimeMenu) {
    data.runtimeMenu = { ...data.runtimeMenu, options: runtimeOptions };
    changed = true;
  }

  return changed ? { ...node, data } : node;
}

function clearOptionReferences(
  options: IVRRuntimeMenuOption[] | undefined,
  deletedNodeId: string
): IVRRuntimeMenuOption[] | undefined {
  if (!options?.some(option => option.destinationNodeId === deletedNodeId)) {
    return options;
  }

  return options.map(option => {
    if (option.destinationNodeId !== deletedNodeId) {
      return option;
    }
    const remainingOption = { ...option };
    delete remainingOption.destinationNodeId;
    return remainingOption;
  });
}

function normalizeKind(value: IVRNodeData["nodeKind"]): IVRNodeKind | null {
  return value ?? null;
}
