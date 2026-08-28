import type { IVREdge, IVRNode } from "@/components/ivr/types";

export type FlowCopilotPatchOperation = {
  op: "addNode" | "updateNode" | "removeNode" | "addEdge" | "updateEdge" | "removeEdge";
  targetId?: string;
  node?: IVRNode;
  edge?: IVREdge;
  patch?: Record<string, unknown>;
};

export type FlowCopilotPatch = {
  operations: FlowCopilotPatchOperation[];
  added: string[];
  modified: string[];
  removed: string[];
};

type FlowGraph = {
  nodes: IVRNode[];
  edges: IVREdge[];
};

function cloneNode(node: IVRNode): IVRNode {
  return {
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  };
}

function cloneEdge(edge: IVREdge): IVREdge {
  return {
    ...edge,
    data: edge.data ? { ...edge.data } : undefined,
  };
}

export function applyFlowCopilotPatch(
  currentFlow: FlowGraph,
  patch: FlowCopilotPatch
): FlowGraph {
  const nodes = new Map(currentFlow.nodes.map(node => [node.id, cloneNode(node)]));
  const edges = new Map(currentFlow.edges.map(edge => [edge.id, cloneEdge(edge)]));

  for (const operation of patch.operations) {
    const targetId = operation.targetId?.trim() ?? "";

    switch (operation.op) {
      case "addNode": {
        if (!operation.node || nodes.has(operation.node.id)) {
          throw new Error("Invalid addNode patch operation");
        }
        nodes.set(operation.node.id, cloneNode(operation.node));
        break;
      }
      case "updateNode": {
        if (!targetId || !nodes.has(targetId)) {
          throw new Error("Invalid updateNode patch target");
        }
        const existing = nodes.get(targetId)!;
        nodes.set(targetId, operation.node
          ? cloneNode({ ...operation.node, id: targetId })
          : {
              ...existing,
              data: {
                ...existing.data,
                ...(operation.patch ?? {}),
              },
            });
        break;
      }
      case "removeNode": {
        if (!targetId || !nodes.delete(targetId)) {
          throw new Error("Invalid removeNode patch target");
        }
        for (const [edgeId, edge] of edges) {
          if (edge.source === targetId || edge.target === targetId) {
            edges.delete(edgeId);
          }
        }
        break;
      }
      case "addEdge": {
        if (
          !operation.edge ||
          edges.has(operation.edge.id) ||
          !nodes.has(operation.edge.source) ||
          !nodes.has(operation.edge.target)
        ) {
          throw new Error("Invalid addEdge patch operation");
        }
        edges.set(operation.edge.id, cloneEdge(operation.edge));
        break;
      }
      case "updateEdge": {
        if (!targetId || !edges.has(targetId)) {
          throw new Error("Invalid updateEdge patch target");
        }
        const existing = edges.get(targetId)!;
        const next = operation.edge
          ? cloneEdge({ ...operation.edge, id: targetId })
          : {
              ...existing,
              data: {
                ...existing.data,
                ...(operation.patch ?? {}),
              },
            };
        if (!nodes.has(next.source) || !nodes.has(next.target)) {
          throw new Error("Invalid updateEdge patch destination");
        }
        edges.set(targetId, next);
        break;
      }
      case "removeEdge": {
        if (!targetId || !edges.delete(targetId)) {
          throw new Error("Invalid removeEdge patch target");
        }
        break;
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}
