"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useState } from "react";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Node,
} from "@xyflow/react";

import { useSaveFlow } from "@/features/ivr/use-save-flow";
import { useUpdateFlow } from "@/features/ivr/use-update-flow";
import { useFlow } from "@/features/ivr/use-flow";

import IVRNode from "./ivr-node";
import IVRToolbar from "./ivr-toolbar";
import AIPropertiesPanel from "./properties/ai-properties-panel";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

import {
  defaultEdgeOptions,
} from "./edge-options";

const nodeTypes = {
  ivr: IVRNode,
};

export default function IVRCanvas() {

  const [selectedNode, setSelectedNode] =
    useState<Node | null>(null);

  const {
    nodes,
    setNodes,

    edges,
    setEdges,

    selectedFlow,

    flowName,
    setFlowName,

    onConnect,
  } = useIVRBuilder();

  const saveFlow = useSaveFlow();
  const updateFlow = useUpdateFlow();

  const {
    data: flow,
  } = useFlow(selectedFlow);

  useEffect(() => {
    if (!flow) return;

    setNodes(flow.nodes ?? []);
    setEdges(flow.edges ?? []);

    setFlowName(
      flow.name ?? "Untitled Flow"
    );
  }, [
    flow,
    setNodes,
    setEdges,
    setFlowName,
  ]);

  function handleSave() {
    if (selectedFlow) {
      updateFlow.mutate({
        id: selectedFlow,
        nodes,
        edges,
      });
    } else {
      saveFlow.mutate({
        name: flowName,
        nodes,
        edges,
      });
    }
  }

  function updateNode(
    field: string,
    value: any
  ) {
    if (!selectedNode) return;

    setNodes((previous) =>
      previous.map((node) => {
        if (node.id !== selectedNode.id) {
          return node;
        }

        const updatedNode = {
          ...node,

          data: {
            ...node.data,

            [field]: value,
          },
        };

        setSelectedNode(updatedNode);

        return updatedNode;
      })
    );
  }

  function onDrop(
    event: React.DragEvent
  ) {
    event.preventDefault();

    const label =
      event.dataTransfer.getData(
        "application/reactflow"
      );

    if (!label) return;

    const node = {
      id: crypto.randomUUID(),

      type: "ivr",

      position: {
        x: event.clientX - 320,
        y: event.clientY - 90,
      },
data: {
  label: "AI Assistant",

  prompt: "",

  provider: "OpenAI",

  voice: "alloy",

  language: "English",

  speed: 1,

  pitch: 0,

  temperature: 0.7,

  topP: 1,

  maxTokens: 1024,

  presencePenalty: 0,

  frequencyPenalty: 0,

  knowledge: [],
},
    };

    setNodes((previous) => [
      ...previous,
      node,
    ]);
  }

  return (
    <div className="flex flex-1 flex-col">

      <IVRToolbar
        saving={
          saveFlow.isPending ||
          updateFlow.isPending
        }
        onSave={handleSave}
      />

      <div
  className="flex flex-1"
  onDrop={onDrop}
  onDragOver={(e) => e.preventDefault()}
>
  {/* React Flow Canvas */}
  <div className="flex-1">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onNodeClick={(_, node) => {
        setSelectedNode(node);
      }}
      defaultEdgeOptions={defaultEdgeOptions}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      edgesReconnectable
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  </div>

  {/* Right Properties Panel */}
  <AIPropertiesPanel
    node={selectedNode}
    onChange={updateNode}
  />
</div>

</div>
);
}