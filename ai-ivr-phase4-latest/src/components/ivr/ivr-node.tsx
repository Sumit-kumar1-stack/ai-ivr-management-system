"use client";

import {
  Handle,
  Position,
} from "@xyflow/react";

import {
  Bot,
  CircleStop,
  GitBranch,
  Gauge,
  Keyboard,
  MessageSquare,
  PhoneCall,
  UserRound,
} from "lucide-react";

import type {
  IVRNodeData,
  IVRNodeKind,
} from "./types";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface Props {
  data:
    IVRNodeData;
}

//--------------------------------------------------
// Icon
//--------------------------------------------------

function NodeIcon({
  kind,
}: {
  kind?:
    IVRNodeKind;
}) {
  switch (
    kind
  ) {
    case "AI":
      return (
        <Bot className="h-4 w-4" />
      );

    case "ACTION":
      return (
        <Gauge className="h-4 w-4" />
      );

    case "CONDITION":
      return (
        <GitBranch className="h-4 w-4" />
      );

    case "GREETING":
      return (
        <MessageSquare className="h-4 w-4" />
      );

    case "DTMF_MENU":
      return (
        <Keyboard className="h-4 w-4" />
      );

    case "TRANSFER":
      return (
        <UserRound className="h-4 w-4" />
      );

    case "END_CALL":
      return (
        <CircleStop className="h-4 w-4" />
      );

    case "START":
      return (
        <PhoneCall className="h-4 w-4" />
      );

    default:
      return (
        <GitBranch className="h-4 w-4" />
      );
  }
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function IVRNode({
  data,
}: Props) {
  const label =
    typeof data.label ===
      "string"
      ? data.label
      : "IVR Node";

  const description =
    typeof data.description ===
      "string"
      ? data.description
      : "Configure this IVR node";

  return (
    <div className="w-64 rounded-xl border border-slate-200 bg-white shadow-lg">

      <div className="flex items-center gap-2 rounded-t-xl bg-blue-600 px-4 py-3 text-white">

        <NodeIcon
          kind={
            data.nodeKind
          }
        />

        <span className="font-semibold">
          {label}
        </span>

      </div>

      <div className="space-y-2 p-4">

        <p className="text-sm text-gray-600">
          {description}
        </p>

        {data.nodeKind ===
          "DTMF_MENU" &&
          data.runtimeMenu && (
            <p className="text-xs text-gray-500">
              {
                data.runtimeMenu
                  .options
                  .length
              } keypad options
            </p>
          )}

        {data.nodeKind ===
          "ACTION" &&
          data.actionCode && (
            <p className="text-xs text-gray-500">
              Action code: {data.actionCode}
            </p>
          )}

        {data.nodeKind ===
          "CONDITION" &&
          data.conditionExpression && (
            <p className="text-xs text-gray-500">
              Condition: {data.conditionExpression}
            </p>
          )}

      </div>

      <Handle
        type="target"
        position={
          Position.Top
        }
        id="top"
      />

      <Handle
        type="source"
        position={
          Position.Bottom
        }
        id="bottom"
      />

    </div>
  );
}
