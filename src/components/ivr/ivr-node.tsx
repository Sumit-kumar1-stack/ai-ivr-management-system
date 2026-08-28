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
import { getMenuOptionHandleIds } from "./ivr-node-handles";

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
    case "AI_CONVERSATION":
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
    case "HYBRID_MENU":
      return (
        <Keyboard className="h-4 w-4" />
      );

    case "TRANSFER":
    case "HUMAN_TRANSFER":
      return (
        <UserRound className="h-4 w-4" />
      );

    case "CALLBACK":
      return (
        <PhoneCall className="h-4 w-4" />
      );

    case "KNOWLEDGE":
      return (
        <Bot className="h-4 w-4" />
      );

    case "SEND_INFORMATION":
      return (
        <MessageSquare className="h-4 w-4" />
      );

    case "BUSINESS_HOURS":
      return (
        <Gauge className="h-4 w-4" />
      );

    case "AUTH_GATE":
      return (
        <GitBranch className="h-4 w-4" />
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

  const menuHandleIds =
    data.nodeKind === "DTMF_MENU" || data.nodeKind === "HYBRID_MENU"
      ? getMenuOptionHandleIds(data.options)
      : [];

  const runtime = typeof data.runtime === "string" ? data.runtime.toUpperCase() : null;
  const safety = data.requiredAuthLevel || data.minimumAuthLevel || data.authLevel || data.authenticationLevel
    ? "Authentication required"
    : data.confirmationPrompt ? "Confirmation required" : null;
  const summary = data.nodeKind === "HYBRID_MENU" ? `${data.options?.length ?? 0} options · Staged Hybrid`
    : data.nodeKind === "AI_CONVERSATION" || data.nodeKind === "AI" ? `Runtime: ${runtime ?? "STANDARD"}`
    : data.nodeKind === "KNOWLEDGE" ? `KB: ${(data.knowledgeDocumentIds ?? data.knowledgeIds ?? []).length} selected`
    : data.nodeKind === "ACTION" ? `Tool: ${data.actionCode ?? "not selected"}`
    : null;

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

        {(summary || safety) && <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
          {summary && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{summary}</span>}
          {safety && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{safety}</span>}
        </div>}

        {(data.nodeKind === "DTMF_MENU" || data.nodeKind === "HYBRID_MENU") &&
          data.options && (
            <p className="text-xs text-gray-500">
              {
                data
                  .options
                  .length
              } keypad options
            </p>
          )}

        {data.nodeKind ===
          "KNOWLEDGE" &&
          (data.knowledgeDocumentIds?.length ||
            data.knowledgeIds?.length) && (
            <p className="text-xs text-gray-500">
              Knowledge docs: {(data.knowledgeDocumentIds ?? data.knowledgeIds ?? []).length}
            </p>
          )}

        {data.nodeKind ===
          "ACTION" &&
          data.actionCode && (
            <p className="text-xs text-gray-500">
              Action code: {data.actionCode}
            </p>
          )}

        {(data.nodeKind === "TRANSFER" || data.nodeKind === "HUMAN_TRANSFER") &&
          (data.transferDestinationId ||
            data.destinationId ||
            data.humanTransferDestinationId) && (
            <p className="text-xs text-gray-500">
              Transfer destination: {data.transferDestinationId ?? data.destinationId ?? data.humanTransferDestinationId}
            </p>
          )}

        {data.nodeKind ===
          "CALLBACK" &&
          (data.callbackConfigId || data.callbackDestinationId) && (
            <p className="text-xs text-gray-500">
              Callback config: {data.callbackConfigId ?? data.callbackDestinationId}
            </p>
          )}

        {data.nodeKind ===
          "SEND_INFORMATION" &&
          data.sendInformationTemplateId && (
            <p className="text-xs text-gray-500">
              Template: {data.sendInformationTemplateId}
            </p>
          )}

        {data.nodeKind ===
          "BUSINESS_HOURS" &&
          data.businessHoursPolicyId && (
            <p className="text-xs text-gray-500">
              Policy: {data.businessHoursPolicyId}
            </p>
          )}

        {data.nodeKind ===
          "AUTH_GATE" &&
          (data.requiredAuthLevel ||
            data.minimumAuthLevel ||
            data.authLevel ||
            data.authenticationLevel) && (
            <p className="text-xs text-gray-500">
              Auth level: {data.requiredAuthLevel ?? data.minimumAuthLevel ?? data.authLevel ?? data.authenticationLevel}
            </p>
          )}

        {data.nodeKind ===
          "GREETING" &&
          (data.greeting || data.prompt) && (
            <p className="text-xs text-gray-500">
              Greeting: {data.greeting ?? data.prompt}
            </p>
          )}

        {data.nodeKind ===
          "CONDITION" &&
          data.conditionExpression && (
            <p className="text-xs text-gray-500">
              Condition: {data.conditionExpression}
            </p>
          )}

        {data.nodeKind ===
          "END_CALL" &&
          data.prompt && (
            <p className="text-xs text-gray-500">
              Final speech: {data.prompt}
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

      {menuHandleIds.map((digit, index) => (
        <Handle
          key={digit}
          type="source"
          position={Position.Right}
          id={digit}
          aria-label={`DTMF ${digit} route`}
          style={{ top: `${((index + 1) / (menuHandleIds.length + 1)) * 100}%` }}
        />
      ))}

    </div>
  );
}
