import type { IVREdge, IVRNode } from "./types";

export function edgeBusinessLabel(edge: IVREdge, nodes: IVRNode[]): string {
  const data = edge.data ?? {};
  if (typeof data.label === "string" && data.label.trim()) return data.label.trim();
  const trigger = String(data.trigger ?? "DEFAULT").toUpperCase();
  const value = typeof data.value === "string" ? data.value.trim() : "";
  const source = nodes.find(node => node.id === edge.source);
  const option = source?.data.options?.find(candidate => candidate.digit === value);
  if (trigger === "DTMF") return option ? `${value} — ${option.label}` : value ? `${value}` : "Menu option";
  if (trigger === "VOICE_INTENT") return value ? `Voice: ${value}` : "Voice intent";
  const labels: Record<string, string> = { ACTION_SUCCESS: "Success", ACTION_FAILURE: "Failure", DEFAULT: "Default", AUTHENTICATED: "Authenticated", NOT_AUTHENTICATED: "Not authenticated", AVAILABLE: "Available", OUTSIDE_HOURS: "Outside hours", TIMEOUT: "Timeout", UNAVAILABLE: "Unavailable" };
  return labels[trigger] ?? (value || trigger.replaceAll("_", " "));
}

/** Deterministic left-to-right layout that preserves every graph identifier and config. */
export function layoutIvrGraph(nodes: IVRNode[], edges: IVREdge[]): IVRNode[] {
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const rank = new Map<string, number>();
  const queue = nodes.filter(node => (incoming.get(node.id) ?? 0) === 0).map(node => node.id);
  while (queue.length) {
    const id = queue.shift()!;
    const current = rank.get(id) ?? 0;
    for (const edge of edges.filter(candidate => candidate.source === id)) {
      rank.set(edge.target, Math.max(rank.get(edge.target) ?? 0, current + 1));
      incoming.set(edge.target, (incoming.get(edge.target) ?? 1) - 1);
      if (incoming.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const rows = new Map<number, number>();
  return nodes.map(node => {
    const column = rank.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...node, position: { x: 100 + column * 300, y: 100 + row * 180 } };
  });
}

export function searchIvrNodes(nodes: IVRNode[], query: string): IVRNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return nodes.filter(node => JSON.stringify({ kind: node.data.nodeKind, label: node.data.label, intent: node.data.options?.map(option => option.intent ?? option.action), tool: node.data.actionCode, knowledge: node.data.knowledgeDocumentIds, department: node.data.department }).toLowerCase().includes(needle));
}

export function duplicateIvrNode(node: IVRNode, existingNodes: IVRNode[]): IVRNode {
  let sequence = 1;
  let id = `${node.id}-copy`;
  while (existingNodes.some(candidate => candidate.id === id)) id = `${node.id}-copy-${sequence++}`;
  return { ...node, id, selected: true, position: { x: node.position.x + 40, y: node.position.y + 40 }, data: { ...node.data, label: `${node.data.label ?? "Node"} copy` } };
}
