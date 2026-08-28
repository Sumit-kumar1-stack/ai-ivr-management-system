import type { IVREdge, IVRNode } from "@/components/ivr/types";

import type { IVRFlowValidationIssue, IVRFlowValidationResult } from "./ivr-flow-validator.service";
import type { IVRSimulationResult } from "./ivr-simulator.service";

export type IvrFlowReviewTone = "neutral" | "success" | "warning" | "error";

export interface IvrFlowReviewItem {
  title: string;
  detail: string;
  tone: IvrFlowReviewTone;
  nodeId?: string | null;
}

export interface IvrFlowReviewSummary {
  versionLabel: string | null;
  publishedVersionLabel: string | null;
  noMaterialChanges: boolean;
  submissionSummary: string;
  nodeChanges: IvrFlowReviewItem[];
  edgeChanges: IvrFlowReviewItem[];
  structureFindings: IvrFlowReviewItem[];
  runtimeFindings: IvrFlowReviewItem[];
  knowledgeFindings: IvrFlowReviewItem[];
  toolFindings: IvrFlowReviewItem[];
  authFindings: IvrFlowReviewItem[];
  transferFindings: IvrFlowReviewItem[];
  callbackFindings: IvrFlowReviewItem[];
  validationFindings: IvrFlowReviewItem[];
  simulationFindings: IvrFlowReviewItem[];
  usageFindings: IvrFlowReviewItem[];
}

export interface IvrFlowReviewVersionLike {
  versionNumber: number;
  nodes: IVRNode[];
  edges: IVREdge[];
}

export interface IvrFlowReviewInput {
  currentFlow: {
    name: string;
    version: number;
    nodes: IVRNode[];
    edges: IVREdge[];
  };
  publishedVersion?: IvrFlowReviewVersionLike | null;
  validation?: IVRFlowValidationResult | null;
  simulation?: IVRSimulationResult | null;
  inboundProfiles?: Array<{
    id: string;
    name: string;
    active: boolean;
    provider: string | null;
    inboundNumberMasked: string | null;
    voiceRuntime: string;
    ivrFlowVersionId: string | null;
  }>;
}

type StableRecord = Record<string, unknown>;

const NODE_DIFF_FIELDS: Array<{
  label: string;
  read: (node: IVRNode) => unknown;
}> = [
  { label: "Node kind", read: node => nodeKind(node) },
  { label: "Label", read: node => node.data?.label },
  { label: "Prompt", read: node => node.data?.prompt ?? node.data?.greeting ?? node.data?.question ?? node.data?.instruction },
  { label: "Description", read: node => node.data?.description },
  { label: "Runtime mode", read: node => node.data?.runtimeMode },
  { label: "Runtime default", read: node => node.data?.runtimeDefault },
  { label: "Input experience", read: node => node.data?.inputExperience },
  { label: "Action code", read: node => node.data?.actionCode },
  { label: "Transfer destination", read: node => node.data?.transferDestinationId ?? node.data?.destinationRef ?? node.data?.destinationId ?? node.data?.humanTransferDestinationId },
  { label: "Callback config", read: node => node.data?.callbackConfigId ?? node.data?.callbackDestinationId },
  { label: "Business-hours policy", read: node => node.data?.businessHoursPolicyId },
  { label: "Auth level", read: node => node.data?.requiredAuthLevel ?? node.data?.minimumAuthLevel ?? node.data?.authLevel ?? node.data?.authenticationLevel },
  { label: "Knowledge documents", read: node => normalizeList(node.data?.knowledgeDocumentIds ?? node.data?.knowledgeIds ?? node.data?.knowledge).join(", ") },
  { label: "Menu options", read: node => summarizeMenuOptions(node) },
];

const EDGE_DIFF_FIELDS: Array<{
  label: string;
  read: (edge: IVREdge) => unknown;
}> = [
  { label: "Source", read: edge => edge.source },
  { label: "Target", read: edge => edge.target },
  { label: "Source handle", read: edge => edge.sourceHandle },
  { label: "Target handle", read: edge => edge.targetHandle },
  { label: "Trigger", read: edge => edge.data?.trigger },
  { label: "Value", read: edge => edge.data?.value },
  { label: "Label", read: edge => edge.data?.label },
];

export function summarizeIvrFlowChange(
  previousFlow: { nodes: IVRNode[]; edges: IVREdge[] },
  nextFlow: { nodes: IVRNode[]; edges: IVREdge[] }
): {
  nodeChanges: IvrFlowReviewItem[];
  edgeChanges: IvrFlowReviewItem[];
  noMaterialChanges: boolean;
  summary: string;
} {
  const nodeChanges = summarizeNodeChanges(previousFlow.nodes, nextFlow.nodes);
  const edgeChanges = summarizeEdgeChanges(previousFlow.edges, nextFlow.edges);
  const noMaterialChanges = nodeChanges.length === 0 && edgeChanges.length === 0;

  return {
    nodeChanges,
    edgeChanges,
    noMaterialChanges,
    summary: noMaterialChanges
      ? "No material changes were detected between the two graph snapshots."
      : `${nodeChanges.length} node change(s) and ${edgeChanges.length} edge change(s) were detected.`,
  };
}

export function summarizeCopilotPatch(
  currentFlow: { nodes: IVRNode[]; edges: IVREdge[] },
  candidateFlow: { nodes: IVRNode[]; edges: IVREdge[] }
): string[] {
  const { nodeChanges, edgeChanges, noMaterialChanges } = summarizeIvrFlowChange(currentFlow, candidateFlow);

  if (noMaterialChanges) {
    return ["The candidate matches the current draft without material graph changes."];
  }

  return [
    ...nodeChanges.map(change => `${change.title}: ${change.detail}`),
    ...edgeChanges.map(change => `${change.title}: ${change.detail}`),
  ];
}

export function buildIvrFlowReviewSummary(input: IvrFlowReviewInput): IvrFlowReviewSummary {
  const publishedVersionLabel = input.publishedVersion ? `v${input.publishedVersion.versionNumber}` : null;
  const changeSummary = input.publishedVersion
    ? summarizeIvrFlowChange(
        {
          nodes: input.publishedVersion.nodes,
          edges: input.publishedVersion.edges,
        },
        {
          nodes: input.currentFlow.nodes,
          edges: input.currentFlow.edges,
        }
      )
    : {
        nodeChanges: input.currentFlow.nodes.map(node => ({
          title: `New node: ${describeNode(node)}`,
          detail: `Node kind ${nodeKind(node) || "UNKNOWN"} introduced in draft ${input.currentFlow.version}.`,
          tone: "success" as const,
          nodeId: node.id,
        })),
        edgeChanges: input.currentFlow.edges.map(edge => ({
          title: `New edge: ${describeEdge(edge)}`,
          detail: `Edge ${edge.source} → ${edge.target} is present in the draft only.`,
          tone: "success" as const,
        })),
        noMaterialChanges: input.currentFlow.nodes.length === 0 && input.currentFlow.edges.length === 0,
        summary: "The draft does not have a published comparison snapshot.",
      };

  const validation = input.validation ?? null;
  const simulation = input.simulation ?? null;
  const usage = input.inboundProfiles ?? [];

  const structureFindings = buildStructureFindings(input.currentFlow.nodes, input.currentFlow.edges, validation, changeSummary.noMaterialChanges, publishedVersionLabel);
  const runtimeFindings = summarizeNodeCategory(input.currentFlow.nodes, "START", node => {
    const runtimeMode = stringValue(node.data?.runtimeMode);
    const runtimeDefault = stringValue(node.data?.runtimeDefault);
    if (!runtimeMode && !runtimeDefault) return null;
    if (runtimeMode === "AUTO") {
      return `Entry runtime is AUTO${runtimeDefault ? ` with ${runtimeDefault} fallback` : ""}.`;
    }
    return `Entry runtime is ${runtimeMode ?? "unspecified"}${runtimeDefault ? ` with ${runtimeDefault} fallback` : ""}.`;
  });
  const knowledgeFindings = summarizeNodeCategory(input.currentFlow.nodes, "KNOWLEDGE", node => {
    const docs = normalizeList(node.data?.knowledgeDocumentIds ?? node.data?.knowledgeIds ?? node.data?.knowledge);
    return docs.length > 0
      ? `Knowledge node uses ${docs.length} approved document(s): ${docs.join(", ")}.`
      : "Knowledge node has no authorized documents attached.";
  });
  const toolFindings = summarizeNodeCategory(input.currentFlow.nodes, "ACTION", node => {
    const actionCode = stringValue(node.data?.actionCode);
    return actionCode ? `Business tool action: ${actionCode}.` : "Business tool node has no action code configured.";
  });
  const authFindings = summarizeNodeCategory(input.currentFlow.nodes, "AUTH_GATE", node => {
    const level = stringValue(node.data?.requiredAuthLevel ?? node.data?.minimumAuthLevel ?? node.data?.authLevel ?? node.data?.authenticationLevel);
    return level ? `Authentication requirement: ${level}.` : "Authentication node has no required level configured.";
  });
  const transferFindings = summarizeNodeCategory(input.currentFlow.nodes, "HUMAN_TRANSFER", node => {
    const destination = stringValue(node.data?.transferDestinationId ?? node.data?.destinationRef ?? node.data?.destinationId ?? node.data?.humanTransferDestinationId);
    return destination ? `Transfer destination: ${destination}.` : "Transfer node is missing a destination.";
  });
  const callbackFindings = summarizeNodeCategory(input.currentFlow.nodes, "CALLBACK", node => {
    const callbackConfig = stringValue(node.data?.callbackConfigId ?? node.data?.callbackDestinationId);
    return callbackConfig ? `Callback configuration: ${callbackConfig}.` : "Callback node is missing a callback configuration.";
  });

  const validationFindings = validation
    ? [
        {
          title: validation.valid ? "Validation passed" : "Validation failed",
          detail: validation.valid
            ? "The deterministic validator marked this draft as valid."
            : `The deterministic validator found ${validation.errors.length} error(s) and ${validation.warnings.length} warning(s).`,
          tone: validation.valid ? "success" : "error",
        } satisfies IvrFlowReviewItem,
        ...validation.issues.map(issue => validationIssueToReviewItem(issue)),
      ]
    : [];

  const simulationFindings = simulation
    ? [
        {
          title: simulation.resultingNodeId ? "Simulation reached a node" : "Simulation did not resolve a node",
          detail: simulation.resultingNodeId
            ? `Resulting node: ${simulation.resultingNodeId}${simulation.transition ? ` via ${simulation.transition}` : ""}.`
            : "The simulator could not resolve a resulting node.",
          tone: simulation.resultingNodeId ? "success" : "warning",
          nodeId: simulation.resultingNodeId,
        } satisfies IvrFlowReviewItem,
        ...(simulation.responsePreview
          ? [{
              title: "Response preview",
              detail: simulation.responsePreview,
              tone: "neutral" as const,
            }]
          : []),
        ...(simulation.knowledgeScopeSummary
          ? [{
              title: "Knowledge scope",
              detail: simulation.knowledgeScopeSummary,
              tone: "neutral" as const,
            }]
          : []),
        ...simulation.warnings.map(warning => ({
          title: "Simulation warning",
          detail: warning,
          tone: "warning" as const,
        })),
      ]
    : [];

  const usageFindings = usage.length > 0
    ? usage.map(profile => ({
        title: profile.name,
        detail: `${profile.active ? "Active" : "Inactive"} binding${profile.provider ? ` · ${profile.provider}` : ""}${profile.inboundNumberMasked ? ` · ${profile.inboundNumberMasked}` : ""} · ${profile.voiceRuntime} runtime${profile.ivrFlowVersionId ? ` · version ${profile.ivrFlowVersionId}` : ""}`,
        tone: profile.active ? "success" : "neutral",
      } satisfies IvrFlowReviewItem))
    : [{
        title: "No live bindings",
        detail: "No inbound profile currently uses this IVR flow.",
        tone: "neutral" as const,
      }];

  return {
    versionLabel: `v${input.currentFlow.version}`,
    publishedVersionLabel,
    noMaterialChanges: changeSummary.noMaterialChanges,
    submissionSummary: changeSummary.noMaterialChanges
      ? publishedVersionLabel
        ? `No material graph changes were found relative to ${publishedVersionLabel}.`
        : "No published comparison snapshot is available."
      : publishedVersionLabel
        ? `${changeSummary.nodeChanges.length} node change(s) and ${changeSummary.edgeChanges.length} edge change(s) relative to ${publishedVersionLabel}.`
        : "The current draft introduces a new comparison snapshot.",
    nodeChanges: changeSummary.nodeChanges,
    edgeChanges: changeSummary.edgeChanges,
    structureFindings,
    runtimeFindings,
    knowledgeFindings,
    toolFindings,
    authFindings,
    transferFindings,
    callbackFindings,
    validationFindings,
    simulationFindings,
    usageFindings,
  };
}

function summarizeNodeChanges(previousNodes: IVRNode[], nextNodes: IVRNode[]): IvrFlowReviewItem[] {
  const previous = new Map(previousNodes.map(node => [node.id, node]));
  const next = new Map(nextNodes.map(node => [node.id, node]));
  const result: IvrFlowReviewItem[] = [];

  for (const node of nextNodes) {
    const before = previous.get(node.id);
    if (!before) {
      result.push({
        title: `Added node ${describeNode(node)}`,
        detail: `Node kind ${nodeKind(node) || "UNKNOWN"} was added to the draft.`,
        tone: "success",
        nodeId: node.id,
      });
      continue;
    }

    const changes = describeFieldChanges(before, node, NODE_DIFF_FIELDS);
    if (changes.length > 0) {
      result.push({
        title: `Updated node ${describeNode(node)}`,
        detail: changes.join("; "),
        tone: "warning",
        nodeId: node.id,
      });
    }
  }

  for (const node of previousNodes) {
    if (next.has(node.id)) {
      continue;
    }

    result.push({
      title: `Removed node ${describeNode(node)}`,
      detail: `Node kind ${nodeKind(node) || "UNKNOWN"} was removed from the draft.`,
      tone: "error",
      nodeId: node.id,
    });
  }

  return result;
}

function summarizeEdgeChanges(previousEdges: IVREdge[], nextEdges: IVREdge[]): IvrFlowReviewItem[] {
  const previous = new Map(previousEdges.map(edge => [edge.id, edge]));
  const next = new Map(nextEdges.map(edge => [edge.id, edge]));
  const result: IvrFlowReviewItem[] = [];

  for (const edge of nextEdges) {
    const before = previous.get(edge.id);
    if (!before) {
      result.push({
        title: `Added edge ${describeEdge(edge)}`,
        detail: `Route ${edge.source} → ${edge.target} was added to the draft.`,
        tone: "success",
      });
      continue;
    }

    const changes = describeFieldChanges(before, edge, EDGE_DIFF_FIELDS);
    if (changes.length > 0) {
      result.push({
        title: `Updated edge ${describeEdge(edge)}`,
        detail: changes.join("; "),
        tone: "warning",
      });
    }
  }

  for (const edge of previousEdges) {
    if (next.has(edge.id)) {
      continue;
    }

    result.push({
      title: `Removed edge ${describeEdge(edge)}`,
      detail: `Route ${edge.source} → ${edge.target} was removed from the draft.`,
      tone: "error",
    });
  }

  return result;
}

function buildStructureFindings(
  nodes: IVRNode[],
  edges: IVREdge[],
  validation: IVRFlowValidationResult | null,
  noMaterialChanges: boolean,
  publishedVersionLabel: string | null
): IvrFlowReviewItem[] {
  const findings: IvrFlowReviewItem[] = [];
  const startNodes = nodes.filter(node => nodeKind(node) === "START");
  const terminalNodes = nodes.filter(node => nodeKind(node) === "END_CALL");

  findings.push({
    title: publishedVersionLabel ? `Compared with ${publishedVersionLabel}` : "No published comparison snapshot",
    detail: noMaterialChanges
      ? "The draft matches the published comparison at graph level."
      : "The draft introduces graph changes that should be reviewed carefully.",
    tone: noMaterialChanges ? "success" : "warning",
  });

  findings.push({
    title: startNodes.length > 0 ? "Entry point present" : "Entry point missing",
    detail: startNodes.length > 0
      ? `Found ${startNodes.length} START node(s).`
      : "The draft does not contain a START node.",
    tone: startNodes.length > 0 ? "success" : "error",
  });

  findings.push({
    title: terminalNodes.length > 0 ? "Terminal END present" : "Terminal END missing",
    detail: terminalNodes.length > 0
      ? `Found ${terminalNodes.length} END_CALL node(s).`
      : "The draft does not contain a valid terminal END_CALL node.",
    tone: terminalNodes.length > 0 ? "success" : "warning",
  });

  if (validation) {
    findings.push({
      title: validation.valid ? "Deterministic validation passed" : "Deterministic validation failed",
      detail: validation.valid
        ? "The review snapshot is structurally valid."
        : `Validation reported ${validation.errors.length} blocking error(s).`,
      tone: validation.valid ? "success" : "error",
    });
  }

  const danglingTargets = validation?.issues.filter(issue => issue.code.includes("DANGLING") && issue.severity === "ERROR") ?? [];
  if (danglingTargets.length > 0) {
    findings.push({
      title: "Dangling transitions detected",
      detail: `${danglingTargets.length} edge issue(s) reference a missing target.`,
      tone: "error",
    });
  }

  const deadEnds = validation?.issues.filter(issue => issue.code.includes("DEAD_END")) ?? [];
  if (deadEnds.length > 0) {
    findings.push({
      title: "Dead ends detected",
      detail: `${deadEnds.length} node(s) have no valid exit path.`,
      tone: "warning",
    });
  }

  const invalidFallbacks = validation?.issues.filter(issue => issue.code.includes("FALLBACK")) ?? [];
  if (invalidFallbacks.length > 0) {
    findings.push({
      title: "Fallback configuration review needed",
      detail: `${invalidFallbacks.length} fallback-related issue(s) were reported by the validator.`,
      tone: "warning",
    });
  }

  return findings;
}

function summarizeNodeCategory(
  nodes: IVRNode[],
  kindFilter: string,
  formatter: (node: IVRNode) => string | null
): IvrFlowReviewItem[] {
  const items: Array<IvrFlowReviewItem | null> = nodes
    .filter(node => nodeKind(node) === kindFilter)
    .map(node => {
      const detail = formatter(node);
      return detail
        ? {
            title: `${kindFilter.replaceAll("_", " ")} node · ${describeNode(node)}`,
            detail,
            tone: "neutral" as const,
            nodeId: node.id,
          }
        : null;
    });

  return items.filter(isReviewItem);
}

function validationIssueToReviewItem(issue: IVRFlowValidationIssue): IvrFlowReviewItem {
  return {
    title: issue.code,
    detail: issue.message,
    tone: issue.severity === "ERROR" ? "error" : issue.severity === "WARNING" ? "warning" : "neutral",
    nodeId: issue.nodeId,
  };
}

function isReviewItem(item: IvrFlowReviewItem | null): item is IvrFlowReviewItem {
  return item !== null;
}

function describeFieldChanges<T extends IVRNode | IVREdge>(
  previous: T,
  next: T,
  fields: Array<{
    label: string;
    read: (item: T) => unknown;
  }>
): string[] {
  const changes: string[] = [];

  for (const field of fields) {
    const before = normalizeFieldValue(field.read(previous));
    const after = normalizeFieldValue(field.read(next));
    if (before === after) {
      continue;
    }

    changes.push(`${field.label} changed from ${formatValue(before)} to ${formatValue(after)}`);
  }

  return changes;
}

function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(item => typeof item === "string" ? item.trim() : JSON.stringify(item))).join(" | ");
  }
  if (typeof value === "object") {
    return JSON.stringify(canonicalize(value as StableRecord));
  }
  return String(value).trim();
}

function canonicalize(value: StableRecord): StableRecord {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, Array.isArray(item) ? item.map(entry => typeof entry === "object" && entry !== null ? canonicalize(entry as StableRecord) : entry) : item])
  );
}

function formatValue(value: string): string {
  if (!value) {
    return "none";
  }
  if (value.length > 120) {
    return `${value.slice(0, 117)}…`;
  }
  return value;
}

function nodeKind(node: IVRNode): string {
  return stringValue(node.data?.nodeKind)?.toUpperCase() ?? "";
}

function describeNode(node: IVRNode): string {
  return stringValue(node.data?.label) ?? nodeKind(node) ?? node.id;
}

function describeEdge(edge: IVREdge): string {
  const trigger = stringValue(edge.data?.trigger);
  const value = stringValue(edge.data?.value);
  if (trigger && value) {
    return `${edge.source} → ${edge.target} (${trigger}:${value})`;
  }
  if (trigger) {
    return `${edge.source} → ${edge.target} (${trigger})`;
  }
  return `${edge.source} → ${edge.target}`;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.map(item => {
    if (typeof item === "string") {
      return item.trim();
    }
    if (item && typeof item === "object" && "id" in item && typeof (item as StableRecord).id === "string") {
      return String((item as StableRecord).id).trim();
    }
    return "";
  }));
}

function summarizeMenuOptions(node: IVRNode): string {
  const options = Array.isArray(node.data?.options)
    ? node.data?.options
    : Array.isArray(node.data?.runtimeMenu?.options)
      ? node.data.runtimeMenu?.options
      : [];

  if (!Array.isArray(options) || options.length === 0) {
    return "";
  }

  return options
    .map(option => {
      if (!option || typeof option !== "object") {
        return "";
      }

      const candidate = option as unknown as StableRecord;
      const digit = stringValue(candidate.digit) ?? stringValue(candidate.dtmf) ?? "";
      const label = stringValue(candidate.label) ?? "";
      const destination = stringValue(candidate.destinationNodeId) ?? stringValue(candidate.targetNodeId) ?? stringValue(candidate.destination) ?? stringValue(candidate.target) ?? "";
      return [digit, label, destination].filter(Boolean).join(" → ");
    })
    .filter(Boolean)
    .join(" | ");
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
