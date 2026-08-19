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
    <div className="w-72 border-r border-slate-200/80 bg-slate-50/50 p-5 overflow-y-auto">

      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Saved Flows
      </h3>

      <div className="mb-8 space-y-2">

        {flows.length === 0 && (
          <p className="text-xs text-slate-400 py-2">
            No saved flows found
          </p>
        )}

        {flows.map((flow: IVRFlow) => (
          <button
            key={flow.id}
            onClick={() =>
              setSelectedFlow(flow.id)
            }
            className={`w-full rounded-lg border text-xs font-semibold p-2.5 text-left transition ${
              selectedFlow === flow.id
                ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {flow.name}
          </button>
        ))}

      </div>

      <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Draggable Nodes
      </h3>

      <div className="space-y-2.5">

        {nodes.map((node) => (
          <div
            key={node}
            draggable
            onDragStart={(e) =>
              dragStart(e, node)
            }
            className="cursor-grab rounded-lg border border-slate-200/80 bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-100/50 transition hover:bg-slate-50 hover:text-slate-900 active:cursor-grabbing"
          >
            {node}
          </div>
        ))}

      </div>

    </div>
  );
}