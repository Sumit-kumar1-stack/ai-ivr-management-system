"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type ReactFlowInstance } from "@xyflow/react";

import IVRNode from "./ivr-node";
import { edgeBusinessLabel, layoutIvrGraph } from "./ivr-builder-graph-utils";

import type { IVREdge, IVRNode as IVRFlowNode } from "./types";

const nodeTypes = { ivr: IVRNode };

export interface IVRFlowReviewGraphProps {
  nodes: IVRFlowNode[];
  edges: IVREdge[];
  focusNodeId?: string | null;
}

export default function IVRFlowReviewGraph({ nodes, edges, focusNodeId }: IVRFlowReviewGraphProps) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const laidOutNodes = useMemo(() => layoutIvrGraph(nodes, edges), [nodes, edges]);
  const renderedEdges = useMemo(
    () => edges.map(edge => ({
      ...edge,
      label: edgeBusinessLabel(edge, nodes),
      labelStyle: { fill: "#334155", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92 },
    })),
    [edges, nodes]
  );

  useEffect(() => {
    if (!instance || !focusNodeId) {
      return;
    }

    const node = laidOutNodes.find(candidate => candidate.id === focusNodeId);
    if (!node) {
      return;
    }

    instance.setCenter(node.position.x + 130, node.position.y + 70, { zoom: 1.15, duration: 250 });
  }, [focusNodeId, instance, laidOutNodes]);

  return (
    <div className="h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ReactFlow
        onInit={setInstance}
        nodes={laidOutNodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
