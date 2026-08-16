"use client";

import { useFlows } from "@/features/ivr/use-flows";
import { useIVRBuilder } from "./ivr-builder-context";
import type { IVRFlow } from "./types";

const nodes = [
  "Greeting",
  "AI Prompt",
  "Collect Input",
  "Transfer",
  "End Call",
];

export default function IVRSidebar() {
  const {
    data: flows = [],
  } = useFlows();

  const {
    selectedFlow,
    setSelectedFlow,
  } = useIVRBuilder();

  function dragStart(
    e: React.DragEvent,
    label: string
  ) {
    e.dataTransfer.setData(
      "application/reactflow",
      label
    );

    e.dataTransfer.effectAllowed =
      "move";
  }

  return (
    <div className="w-72 border-r bg-gray-50 p-4 overflow-y-auto">

      <h3 className="mb-3 text-lg font-semibold">
        Saved Flows
      </h3>

      <div className="mb-8 space-y-2">

        {flows.length === 0 && (
          <p className="text-sm text-gray-500">
            No saved flows
          </p>
        )}

        {flows.map((flow: IVRFlow) => (
          <button
            key={flow.id}
            onClick={() =>
              setSelectedFlow(flow.id)
            }
            className={`w-full rounded border p-2 text-left transition ${
              selectedFlow === flow.id
                ? "border-blue-600 bg-blue-50"
                : "bg-white hover:bg-gray-100"
            }`}
          >
            {flow.name}
          </button>
        ))}

      </div>

      <h3 className="mb-4 text-lg font-semibold">
        Nodes
      </h3>

      <div className="space-y-3">

        {nodes.map((node) => (
          <div
            key={node}
            draggable
            onDragStart={(e) =>
              dragStart(e, node)
            }
            className="cursor-grab rounded-lg border bg-white p-3 shadow transition hover:bg-gray-100 active:cursor-grabbing"
          >
            {node}
          </div>
        ))}

      </div>

    </div>
  );
}