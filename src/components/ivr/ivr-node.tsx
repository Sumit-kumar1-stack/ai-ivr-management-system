"use client";

import { Handle, Position } from "@xyflow/react";
import { PhoneCall } from "lucide-react";

interface Props {
  data: {
    label: string;
    description?: string;
  };
}

export default function IVRNode({ data }: Props) {
  return (
    <div className="w-64 rounded-xl border border-slate-200 bg-white shadow-lg">

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-xl bg-blue-600 px-4 py-3 text-white">

        <PhoneCall className="h-4 w-4" />

        <span className="font-semibold">
          {data.label}
        </span>

      </div>

      {/* Body */}
      <div className="space-y-2 p-4">

        <p className="text-sm text-gray-600">
          {data.description ?? "Configure this IVR node"}
        </p>

      </div>

      {/* Connection Handles */}

<Handle
type="target"
position={Position.Top}
id="top"
/>

<Handle
type="source"
position={Position.Bottom}
id="bottom"
/>

    </div>
  );
}