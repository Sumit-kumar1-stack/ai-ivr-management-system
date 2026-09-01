"use client";

import { useId, useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import DTMFMenuPropertiesPanel from "./dtmf-menu-properties-panel";
import { useIVRBuilder } from "./ivr-builder-context";

import type {
  IVRAIFailureBehavior,
  IVRAIPolicyConfig,
  IVRAIPolicyMode,
  IVRConversationalEscapeConfig,
  IVRConversationalEscapeReturnBehavior,
  IVRNode,
  IVRNodeData,
  IVRNodeKind,
  IVRPostActionMode,
} from "./types";

interface Props {
  node: IVRNode;
  onChange: <K extends keyof IVRNodeData>(field: K, value: IVRNodeData[K]) => void;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-slate-700">{children}</label>;
}

export const NODE_PROPERTY_SECTION_NAMES = [
  "BASIC",
  "BEHAVIOR",
  "RUNTIME",
  "ROUTING",
  "SAFETY",
  "ADVANCED",
] as const;

export type NodePropertySectionName = (typeof NODE_PROPERTY_SECTION_NAMES)[number];

/**
 * Keeps the property-panel information architecture deterministic and easy to
 * verify without adding another persisted representation of node settings.
 */
export function getRelevantNodePropertySections(
  nodeKind: IVRNodeKind | undefined,
): readonly NodePropertySectionName[] {
  switch (nodeKind ?? "START") {
    case "GREETING":
      return ["BASIC", "BEHAVIOR", "ROUTING"];
    case "AI":
    case "AI_CONVERSATION":
    case "KNOWLEDGE":
      return ["BASIC", "BEHAVIOR", "RUNTIME", "ROUTING", "SAFETY"];
    case "ACTION":
      return ["BASIC", "BEHAVIOR", "ROUTING", "SAFETY"];
    case "CONDITION":
      return ["BASIC", "BEHAVIOR", "ROUTING"];
    case "HUMAN_TRANSFER":
    case "TRANSFER":
      return ["BASIC", "BEHAVIOR", "ROUTING", "SAFETY", "ADVANCED"];
    case "CALLBACK":
      return ["BASIC", "BEHAVIOR", "ROUTING", "SAFETY"];
    case "SEND_INFORMATION":
      return ["BASIC", "BEHAVIOR", "ROUTING", "SAFETY"];
    case "BUSINESS_HOURS":
      return ["BASIC", "BEHAVIOR", "ROUTING"];
    case "AUTH_GATE":
      return ["BASIC", "BEHAVIOR", "ROUTING", "SAFETY"];
    case "END_CALL":
      return ["BASIC", "BEHAVIOR"];
    case "DTMF_MENU":
    case "HYBRID_MENU":
      return ["BASIC", "BEHAVIOR", "RUNTIME", "ROUTING", "SAFETY"];
    case "START":
    default:
      return ["BASIC", "RUNTIME", "ROUTING"];
  }
}

function PropertySection({
  title,
  description,
  children,
}: {
  title: NodePropertySectionName;
  description?: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4"
      data-property-section={title}
    >
      <div>
        <h4 id={headingId} className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {title}
        </h4>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function GraphRoutingNotice() {
  return (
    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
      Connect this node on the canvas to define its next route. Edge labels describe the route condition without duplicating it here.
    </p>
  );
}

function previewRuntimeSelection(
  flowName: string,
  nodeLabel: string,
  nodeDescription: string,
  nodePrompt: string,
  runtimeDefault: "STANDARD" | "PREMIUM"
): {
  expectedRuntime: "STANDARD" | "PREMIUM" | "USES_DEFAULT";
  reasonText: string;
} {
  const text = `${flowName} ${nodeLabel} ${nodeDescription} ${nodePrompt}`.toLowerCase();
  if (text.includes("faq") || text.includes("information") || text.includes("reminder") || text.includes("survey") || text.includes("qualification")) {
    return {
      expectedRuntime: "STANDARD",
      reasonText: "Informational FAQ flow.",
    };
  }

  return {
    expectedRuntime: "USES_DEFAULT",
    reasonText: runtimeDefault === "PREMIUM"
      ? "Uses configured default at runtime."
      : "Uses configured default at runtime.",
  };
}

export function NodeDestinationPicker({
  nodes,
  value,
  onChange,
  placeholder = "Select a node...",
  filterKinds,
  excludeNodeId,
  className,
}: {
  nodes?: IVRNode[];
  value?: string | null;
  onChange: (nodeId: string) => void;
  placeholder?: string;
  filterKinds?: readonly string[];
  excludeNodeId?: string;
  className?: string;
}) {
  const list = nodes ?? [];
  const eligibleNodes = list.filter(n => {
    if (excludeNodeId && n.id === excludeNodeId) return false;
    if (filterKinds && filterKinds.length > 0) {
      const kind = n.data?.nodeKind ?? "START";
      return filterKinds.includes(kind);
    }
    return true;
  });

  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className={
        className ??
        "h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      }
    >
      <option value="">{placeholder}</option>
      {eligibleNodes.map(n => {
        const label = n.data?.label || n.data?.nodeKind || n.id;
        const kind = n.data?.nodeKind ?? "NODE";
        return (
          <option key={n.id} value={n.id}>
            {label} ({kind} — {n.id})
          </option>
        );
      })}
    </select>
  );
}

export default function NodePropertiesPanel({ node, onChange }: Props) {
  const { nodes = [], resourceCatalog, flowName } = useIVRBuilder();

  const nodeKind = node.data.nodeKind ?? "START";
  const knowledgeOptions = resourceCatalog?.knowledgeDocuments ?? [];
  const actionOptions = resourceCatalog?.actions ?? [];
  const transferOptions = resourceCatalog?.transferDestinations ?? [];
  const callbackOptions = resourceCatalog?.callbackConfigurations ?? [];
  const templateOptions = resourceCatalog?.approvedMessageTemplates ?? [];
  const inboundProfileOptions = resourceCatalog?.inboundProfiles ?? [];
  const campaignOptions = resourceCatalog?.campaigns ?? [];
  const businessHoursOptions = resourceCatalog?.businessHoursPolicies ?? [];
  const authLevels = resourceCatalog?.authenticationLevels ?? [];
  const menuPanel = useMemo(() => nodeKind === "HYBRID_MENU" || nodeKind === "DTMF_MENU", [nodeKind]);

  if (menuPanel) {
    return (
      <DTMFMenuPropertiesPanel
        node={node}
        onChange={(runtimeMenu, options) => {
          onChange("runtimeMenu", runtimeMenu);
          onChange("options", options);
        }}
        onNodeDataChange={onChange}
      />
    );
  }

  const relevantSections = getRelevantNodePropertySections(nodeKind);
  const hasSection = (section: NodePropertySectionName) => relevantSections.includes(section);
  const isAiConversation = nodeKind === "AI" || nodeKind === "AI_CONVERSATION";
  const isTransfer = nodeKind === "HUMAN_TRANSFER" || nodeKind === "TRANSFER";
  const isStagedHybrid = node.data.inputExperience === "STAGED_HYBRID";
  const configuredRuntimeMode = node.data.runtimeMode ?? "AUTO";
  const configuredRuntimeDefault = node.data.runtimeDefault ?? "STANDARD";
  const runtimePreview = previewRuntimeSelection(
    flowName,
    node.data.label ?? "",
    node.data.description ?? "",
    node.data.prompt ?? "",
    configuredRuntimeDefault
  );
  const hasBehaviorPrompt =
    nodeKind === "GREETING" ||
    nodeKind === "CALLBACK" ||
    nodeKind === "SEND_INFORMATION" ||
    nodeKind === "BUSINESS_HOURS" ||
    nodeKind === "AUTH_GATE" ||
    isTransfer ||
    nodeKind === "END_CALL";

  const behaviorPromptLabel =
    nodeKind === "CALLBACK"
      ? "Callback Prompt"
      : nodeKind === "SEND_INFORMATION"
        ? "Information Prompt"
        : nodeKind === "BUSINESS_HOURS"
          ? "Hours Prompt"
          : nodeKind === "AUTH_GATE"
            ? "Auth Prompt"
            : nodeKind === "END_CALL"
              ? "Final Message"
              : "Prompt";

  const behaviorPromptValue =
    (nodeKind === "GREETING" && node.data.greeting) ||
    node.data.prompt ||
    node.data.instruction ||
    node.data.question ||
    "";

  function updateBehaviorPrompt(value: string) {
    onChange("prompt", value);
    if (nodeKind === "GREETING") {
      // Greeting is retained for existing drafts; prompt is the canonical editor field.
      onChange("greeting", value);
    }
  }

  const knowledgeDocumentField = (
    <div>
      <FieldLabel>Knowledge Documents</FieldLabel>
      <select
        multiple
        value={Array.isArray(node.data.knowledgeDocumentIds) ? node.data.knowledgeDocumentIds : []}
        onChange={event => {
          const values = Array.from(event.target.selectedOptions).map(option => option.value);
          onChange("knowledgeDocumentIds", values);
        }}
        className="h-44 w-full rounded-md border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      >
        {knowledgeOptions.map(document => (
          <option key={document.id} value={document.id}>
            {document.name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-slate-500">Only tenant-approved knowledge documents are shown.</p>
    </div>
  );

  function selectNodeKindName(): string {
    switch (nodeKind) {
      case "GREETING":
        return "Greeting";
      case "AI":
      case "AI_CONVERSATION":
        return "AI Conversation";
      case "KNOWLEDGE":
        return "Knowledge";
      case "ACTION":
        return "Business Tool";
      case "CONDITION":
        return "Condition";
      case "BUSINESS_HOURS":
        return "Business Hours";
      case "AUTH_GATE":
        return "Authentication Gate";
      case "HUMAN_TRANSFER":
      case "TRANSFER":
        return "Agent Transfer";
      case "CALLBACK":
        return "Callback";
      case "SEND_INFORMATION":
        return "Send Information";
      case "END_CALL":
        return "End Call";
      default:
        return "Start";
    }
  }

  return (
    <aside className="w-[390px] overflow-y-auto border-l border-slate-200/80 bg-white p-5">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Node Properties</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectNodeKindName()}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {node.data.description ?? "Configure this node using structured controls."}
        </p>
      </div>

      <div className="space-y-5">
        {hasSection("BASIC") && (
          <PropertySection title="BASIC" description="Name and describe this step for reviewers and operators.">
            <div>
              <FieldLabel>Label</FieldLabel>
              <Input value={node.data.label ?? ""} onChange={event => onChange("label", event.target.value)} placeholder="Node label" />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={node.data.description ?? ""} onChange={event => onChange("description", event.target.value)} placeholder="Describe what this node does" />
            </div>
          </PropertySection>
        )}

        {hasBehaviorPrompt && hasSection("BEHAVIOR") && (
          <PropertySection title="BEHAVIOR" description="Define what the caller hears or what this step asks for.">
            <div>
              <FieldLabel>{behaviorPromptLabel}</FieldLabel>
              <Textarea rows={4} value={behaviorPromptValue} onChange={event => updateBehaviorPrompt(event.target.value)} placeholder="Describe the node behavior" />
            </div>
          </PropertySection>
        )}

        {isAiConversation && hasSection("BEHAVIOR") && (
          <PropertySection title="BEHAVIOR" description="Set the customer-facing instructions for this AI conversation.">
            <div>
              <FieldLabel>System Prompt</FieldLabel>
              <Textarea rows={8} value={node.data.prompt ?? ""} onChange={event => onChange("prompt", event.target.value)} placeholder="You are an AI assistant..." />
            </div>
          </PropertySection>
        )}

        {nodeKind === "KNOWLEDGE" && hasSection("BEHAVIOR") && (
          <PropertySection title="BEHAVIOR" description="Describe the business question that this step resolves.">
            <div>
              <FieldLabel>Knowledge Prompt</FieldLabel>
              <Textarea rows={5} value={node.data.prompt ?? ""} onChange={event => onChange("prompt", event.target.value)} placeholder="Ask the knowledge engine a business question" />
            </div>
          </PropertySection>
        )}

        {nodeKind === "ACTION" && hasSection("BEHAVIOR") && (
          <PropertySection title="BEHAVIOR" description="Choose the approved business tool or external integration action this step invokes.">
            <div>
              <FieldLabel>Business / Integration Action</FieldLabel>
              <select value={node.data.actionCode ?? ""} onChange={event => onChange("actionCode", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select an action</option>
                {actionOptions.map(action => <option key={action.id} value={action.actionCode}>{action.name} ({action.actionCode})</option>)}
              </select>
            </div>
            <div className="mt-3">
              <FieldLabel>Required Authentication</FieldLabel>
              <select
                value={node.data.requiredAuthLevel ?? "AUTH_LEVEL_0"}
                onChange={event => onChange("requiredAuthLevel", event.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="AUTH_LEVEL_0">None (Public)</option>
                <option value="AUTH_LEVEL_1">AUTH_LEVEL_1 (Standard Customer Verification)</option>
                <option value="AUTH_LEVEL_2">AUTH_LEVEL_2 (High Security / Step-Up)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Sensitive operations require an AUTH_GATE before invocation.</p>
            </div>
            <div className="mt-3">
              <FieldLabel>Timeout (ms)</FieldLabel>
              <Input
                type="number"
                value={typeof node.data.timeoutMs === "number" || typeof node.data.timeoutMs === "string" ? node.data.timeoutMs : 5000}
                onChange={event => onChange("timeoutMs", Number(event.target.value) || 5000)}
                placeholder="5000"
              />
            </div>
          </PropertySection>
        )}

        {nodeKind === "CONDITION" && hasSection("BEHAVIOR") && (
          <PropertySection title="BEHAVIOR" description="Evaluate a structured condition before routing the caller.">
            <div>
              <FieldLabel>Condition Expression</FieldLabel>
              <Input value={node.data.conditionExpression ?? ""} onChange={event => onChange("conditionExpression", event.target.value)} placeholder="customer.intent == 'INTERESTED'" />
            </div>
          </PropertySection>
        )}

        {isAiConversation && hasSection("RUNTIME") && (
          <PropertySection title="RUNTIME" description="Choose the tenant-approved knowledge context available to this conversation.">
            {knowledgeDocumentField}
          </PropertySection>
        )}

        {nodeKind === "KNOWLEDGE" && hasSection("RUNTIME") && (
          <PropertySection title="RUNTIME" description="Restrict retrieval to tenant-approved knowledge documents.">
            {knowledgeDocumentField}
          </PropertySection>
        )}

        {nodeKind === "START" && hasSection("RUNTIME") && (
          <PropertySection title="RUNTIME" description="Select the caller input experience at flow entry.">
            <div>
              <FieldLabel>Voice Runtime</FieldLabel>
              <select
                value={configuredRuntimeMode}
                onChange={event => onChange("runtimeMode", event.target.value as "STANDARD" | "PREMIUM" | "AUTO")}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="STANDARD">STANDARD</option>
                <option value="PREMIUM">PREMIUM</option>
                <option value="AUTO">AUTO</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                STANDARD is the optimized cascaded voice runtime. PREMIUM uses Gemini Live. AUTO resolves once at call entry.
              </p>
            </div>
            {configuredRuntimeMode === "AUTO" && (
              <div>
                <FieldLabel>Configured Default Runtime</FieldLabel>
                <select
                  value={configuredRuntimeDefault}
                  onChange={event => onChange("runtimeDefault", event.target.value as "STANDARD" | "PREMIUM")}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="STANDARD">STANDARD</option>
                  <option value="PREMIUM">PREMIUM</option>
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  AUTO needs a supported fallback if policy cannot decide at entry.
                </p>
              </div>
            )}
            {configuredRuntimeMode === "AUTO" && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
                <div className="font-semibold tracking-wide">Expected entry selection: {runtimePreview.expectedRuntime === "USES_DEFAULT" ? configuredRuntimeDefault : runtimePreview.expectedRuntime}</div>
                <p className="mt-1">Reason: {runtimePreview.reasonText}</p>
              </div>
            )}
            <div>
              <FieldLabel>Input Experience</FieldLabel>
              <select value={node.data.inputExperience ?? "VOICE"} onChange={event => onChange("inputExperience", event.target.value as "VOICE" | "KEYPAD" | "STAGED_HYBRID")} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="VOICE">Voice AI</option>
                <option value="KEYPAD">Keypad IVR</option>
                <option value="STAGED_HYBRID">Staged Hybrid — XML keypad entry, then realtime AI</option>
              </select>
              {isStagedHybrid && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
                  <div className="font-semibold tracking-wide">ENTRY INPUT → DTMF / ROUTER → SELECTED IVR CONTEXT → REALTIME AI</div>
                  <p className="mt-2">Keypad selection is collected before realtime AI starts. Once realtime AI begins, use voice commands for agent, repeat, main menu and ending the call.</p>
                </div>
              )}
            </div>
          </PropertySection>
        )}

        {(nodeKind === "GREETING" || nodeKind === "CONDITION" || nodeKind === "KNOWLEDGE" || nodeKind === "ACTION" || nodeKind === "AUTH_GATE") && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Use the canvas to connect this step to the appropriate next node.">
            <GraphRoutingNotice />
          </PropertySection>
        )}

        {isAiConversation && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Configure an optional safe fallback, then connect the matching edge on the canvas.">
            <div>
              <FieldLabel>Fallback Node ID</FieldLabel>
              <Input value={node.data.fallbackNodeId ?? ""} onChange={event => onChange("fallbackNodeId", event.target.value)} placeholder="Optional fallback node" />
            </div>
            <GraphRoutingNotice />
          </PropertySection>
        )}

        {isTransfer && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Choose the approved destination and any safe fallback route.">
            <div>
              <FieldLabel>Transfer Destination</FieldLabel>
              <select value={node.data.transferDestinationId ?? node.data.destinationId ?? node.data.humanTransferDestinationId ?? ""} onChange={event => { onChange("transferDestinationId", event.target.value); onChange("destinationRef", event.target.value); }} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select a transfer destination</option>
                {transferOptions.map(destination => <option key={destination.id} value={destination.id}>{destination.label}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-500">Only tenant-owned destinations in this catalog can be selected.</p>
            </div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <Input value={node.data.department ?? ""} onChange={event => onChange("department", event.target.value)} placeholder="Support" />
            </div>
            <div>
              <FieldLabel>Fallback Node ID</FieldLabel>
              <Input value={node.data.fallbackNodeId ?? ""} onChange={event => onChange("fallbackNodeId", event.target.value)} placeholder="Optional fallback node" />
            </div>
          </PropertySection>
        )}

        {nodeKind === "CALLBACK" && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Choose the tenant callback configuration and a failure route.">
            <div>
              <FieldLabel>Callback Configuration</FieldLabel>
              <select value={node.data.callbackConfigId ?? node.data.callbackDestinationId ?? ""} onChange={event => onChange("callbackConfigId", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select a callback configuration</option>
                {callbackOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Fallback Node ID</FieldLabel>
              <Input value={node.data.fallbackNodeId ?? ""} onChange={event => onChange("fallbackNodeId", event.target.value)} placeholder="Required when callback has a failure branch" />
            </div>
          </PropertySection>
        )}

        {nodeKind === "BUSINESS_HOURS" && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Apply the business-hours policy before following the graph route.">
            <div>
              <FieldLabel>Business Hours Policy</FieldLabel>
              <select value={node.data.businessHoursPolicyId ?? ""} onChange={event => onChange("businessHoursPolicyId", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select a policy</option>
                {businessHoursOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-500">Business-hours policies can be wired in when they exist in the tenant catalog.</p>
            </div>
          </PropertySection>
        )}

        {nodeKind === "START" && hasSection("ROUTING") && (
          <PropertySection title="ROUTING" description="Set the flow entry target, fallback, and global adaptive navigation commands.">
            <div>
              <FieldLabel>First Node ID</FieldLabel>
              <Input value={node.data.nextNodeId ?? ""} onChange={event => onChange("nextNodeId", event.target.value)} placeholder="greeting" />
            </div>
            <div>
              <FieldLabel>Main Menu / Root Menu</FieldLabel>
              <NodeDestinationPicker
                nodes={nodes}
                value={
                  typeof node.data.mainMenuNodeId === "string"
                    ? node.data.mainMenuNodeId
                    : typeof node.data.homeNodeId === "string"
                      ? (node.data.homeNodeId as string)
                      : typeof node.data.logicalRootMenuNodeId === "string"
                        ? node.data.logicalRootMenuNodeId
                        : ""
                }
                onChange={value => {
                  onChange("mainMenuNodeId", value || undefined);
                  onChange("logicalRootMenuNodeId", value || undefined);
                }}
                placeholder="Select root menu..."
                filterKinds={["HYBRID_MENU", "DTMF_MENU", "START"]}
              />
              <p className="mt-1 text-xs text-slate-500">Logical root menu used by HOME commands and navigation fallbacks.</p>
            </div>
            {isStagedHybrid && (
              <div>
                <FieldLabel>Default AI Node ID</FieldLabel>
                <Input value={node.data.defaultAiNodeId ?? ""} onChange={event => onChange("defaultAiNodeId", event.target.value)} placeholder="ai-conversation" />
                <p className="mt-2 text-xs text-slate-500">Used as the documented no-selection context when Plivo falls through to realtime AI.</p>
              </div>
            )}

            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <h5 className="text-xs font-semibold uppercase text-slate-700">Adaptive Global Navigation</h5>
              <p className="text-xs text-slate-500">Configure global semantic shortcuts available across menus. Current-menu options take precedence if digits or phrases conflict.</p>

              {/* HOME */}
              <div className="space-y-2 border-t pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={node.data.navigation?.home?.enabled !== false && Boolean(node.data.navigation?.home)}
                    onChange={event => {
                      const nav = node.data.navigation ?? {};
                      const home = nav.home ?? {};
                      onChange("navigation", { ...nav, home: { ...home, enabled: event.target.checked } });
                    }}
                  />
                  Enable HOME Command
                </label>
                {node.data.navigation?.home?.enabled !== false && Boolean(node.data.navigation?.home) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-600">Digits (comma separated)</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.home?.digits?.join(", ") ?? ""}
                        placeholder="0"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const home = nav.home ?? {};
                          const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, home: { ...home, digits } });
                        }}
                      />
                    </div>
                    <div>
                      <span className="text-slate-600">Speech Phrases</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.home?.phrases?.join(", ") ?? ""}
                        placeholder="main menu, start over"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const home = nav.home ?? {};
                          const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, home: { ...home, phrases } });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* BACK */}
              <div className="space-y-2 border-t pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={node.data.navigation?.back?.enabled !== false && Boolean(node.data.navigation?.back)}
                    onChange={event => {
                      const nav = node.data.navigation ?? {};
                      const back = nav.back ?? {};
                      onChange("navigation", { ...nav, back: { ...back, enabled: event.target.checked } });
                    }}
                  />
                  Enable BACK Command
                </label>
                {node.data.navigation?.back?.enabled !== false && Boolean(node.data.navigation?.back) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-600">Digits (comma separated)</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.back?.digits?.join(", ") ?? ""}
                        placeholder="*"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const back = nav.back ?? {};
                          const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, back: { ...back, digits } });
                        }}
                      />
                    </div>
                    <div>
                      <span className="text-slate-600">Speech Phrases</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.back?.phrases?.join(", ") ?? ""}
                        placeholder="go back, previous menu"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const back = nav.back ?? {};
                          const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, back: { ...back, phrases } });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* REPEAT */}
              <div className="space-y-2 border-t pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={node.data.navigation?.repeat?.enabled !== false && Boolean(node.data.navigation?.repeat)}
                    onChange={event => {
                      const nav = node.data.navigation ?? {};
                      const repeat = nav.repeat ?? {};
                      onChange("navigation", { ...nav, repeat: { ...repeat, enabled: event.target.checked } });
                    }}
                  />
                  Enable REPEAT Command
                </label>
                {node.data.navigation?.repeat?.enabled !== false && Boolean(node.data.navigation?.repeat) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-600">Digits (comma separated)</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.repeat?.digits?.join(", ") ?? ""}
                        placeholder="8"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const repeat = nav.repeat ?? {};
                          const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, repeat: { ...repeat, digits } });
                        }}
                      />
                    </div>
                    <div>
                      <span className="text-slate-600">Speech Phrases</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.repeat?.phrases?.join(", ") ?? ""}
                        placeholder="repeat, say that again"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const repeat = nav.repeat ?? {};
                          const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, repeat: { ...repeat, phrases } });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* END */}
              <div className="space-y-2 border-t pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={node.data.navigation?.end?.enabled !== false && Boolean(node.data.navigation?.end)}
                    onChange={event => {
                      const nav = node.data.navigation ?? {};
                      const end = nav.end ?? {};
                      onChange("navigation", { ...nav, end: { ...end, enabled: event.target.checked } });
                    }}
                  />
                  Enable END Command
                </label>
                {node.data.navigation?.end?.enabled !== false && Boolean(node.data.navigation?.end) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-600">Digits (comma separated)</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.end?.digits?.join(", ") ?? ""}
                        placeholder="9"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const end = nav.end ?? {};
                          const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, end: { ...end, digits } });
                        }}
                      />
                    </div>
                    <div>
                      <span className="text-slate-600">Speech Phrases</span>
                      <Input
                        className="h-8 text-xs"
                        value={node.data.navigation?.end?.phrases?.join(", ") ?? ""}
                        placeholder="goodbye, end call"
                        onChange={event => {
                          const nav = node.data.navigation ?? {};
                          const end = nav.end ?? {};
                          const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onChange("navigation", { ...nav, end: { ...end, phrases } });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PropertySection>
        )}

        {nodeKind !== "START" &&
          ["KNOWLEDGE", "ACTION", "SEND_INFORMATION", "GREETING"].includes(nodeKind) &&
          hasSection("ROUTING") && (
            <PropertySection
              title="ROUTING"
              description="Configure what happens after this node finishes playing or executing."
            >
              <div>
                <FieldLabel>After Completion Policy</FieldLabel>
                <select
                  value={node.data.postAction?.mode ?? ""}
                  onChange={event => {
                    const mode = event.target.value as IVRPostActionMode;
                    if (!mode) {
                      const updatedData = { ...node.data };
                      delete updatedData.postAction;
                      onChange("postAction", undefined);
                    } else {
                      onChange("postAction", {
                        ...node.data.postAction,
                        mode,
                      });
                    }
                  }}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Follow Graph Edges (Default)</option>
                  <option value="RETURN_HOME">Return to Main Menu</option>
                  <option value="RETURN_PREVIOUS">Return to Previous</option>
                  <option value="STAY_CURRENT">Stay Here</option>
                  <option value="ASK_NEXT_ACTION">Ask What Next</option>
                  <option value="CONTINUE_TO_NODE">Continue To...</option>
                  <option value="END_CALL">End Call</option>
                </select>
              </div>

              {node.data.postAction?.mode === "CONTINUE_TO_NODE" && (
                <div className="mt-3">
                  <FieldLabel>Destination Node</FieldLabel>
                  <NodeDestinationPicker
                    nodes={nodes}
                    value={node.data.postAction?.targetNodeId}
                    onChange={val =>
                      onChange("postAction", {
                        mode: "CONTINUE_TO_NODE",
                        ...node.data.postAction,
                        targetNodeId: val,
                      })
                    }
                    placeholder="Select destination node..."
                    excludeNodeId={node.id}
                  />
                  <p className="mt-1 text-xs text-slate-500">Node to automatically navigate to after this action completes.</p>
                </div>
              )}

              {node.data.postAction?.mode === "ASK_NEXT_ACTION" && (
                <div className="mt-3">
                  <FieldLabel>Next-Action Prompt</FieldLabel>
                  <Input
                    value={node.data.postAction?.prompt ?? ""}
                    onChange={event =>
                      onChange("postAction", {
                        mode: "ASK_NEXT_ACTION",
                        ...node.data.postAction,
                        prompt: event.target.value,
                      })
                    }
                    placeholder="e.g. Would you like more information, return to main menu, or speak with an agent?"
                  />
                  <p className="mt-1 text-xs text-slate-500">Deterministic prompt spoken to ask the caller for their next choice.</p>
                </div>
              )}
            </PropertySection>
          )}

        {["HYBRID_MENU", "DTMF_MENU"].includes(nodeKind) && hasSection("BEHAVIOR") && (
          <PropertySection
            title="BEHAVIOR"
            description="Allow callers to ask business questions directly from this menu."
          >
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={node.data.conversationalEscape?.enabled === true}
                  onChange={event => {
                    const enabled = event.target.checked;
                    if (!enabled) {
                      const updated = { ...node.data };
                      delete updated.conversationalEscape;
                      onChange("conversationalEscape", undefined);
                    } else {
                      onChange("conversationalEscape", {
                        enabled: true,
                        targetNodeId: node.data.conversationalEscape?.targetNodeId ?? "",
                        prompt: node.data.conversationalEscape?.prompt ?? null,
                        returnBehavior: node.data.conversationalEscape?.returnBehavior ?? "RETURN_CONTEXT",
                      });
                    }
                  }}
                />
                Enable Conversational Escape
              </label>

              {node.data.conversationalEscape?.enabled && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div>
                    <FieldLabel>Target Assistant / Knowledge Node</FieldLabel>
                    <NodeDestinationPicker
                      nodes={nodes}
                      value={node.data.conversationalEscape.targetNodeId}
                      onChange={val =>
                        onChange("conversationalEscape", {
                          enabled: true,
                          ...node.data.conversationalEscape,
                          targetNodeId: val,
                        })
                      }
                      placeholder="Select assistant / knowledge node..."
                      filterKinds={["KNOWLEDGE", "AI", "AI_CONVERSATION"]}
                      excludeNodeId={node.id}
                    />
                    <p className="mt-1 text-xs text-slate-500">Destination node to handle free-form questions from callers.</p>
                  </div>

                  <div>
                    <FieldLabel>After Answering</FieldLabel>
                    <select
                      value={node.data.conversationalEscape.returnBehavior ?? "RETURN_CONTEXT"}
                      onChange={event =>
                        onChange("conversationalEscape", {
                          enabled: true,
                          ...node.data.conversationalEscape,
                          returnBehavior: event.target.value as IVRConversationalEscapeReturnBehavior,
                        })
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="RETURN_CONTEXT">Return to this menu (Side-turn)</option>
                      <option value="STAY_CONVERSATIONAL">Stay in assistant for follow-up questions</option>
                      <option value="FOLLOW_TARGET_POST_ACTION">Follow assistant's configured next step</option>
                    </select>
                  </div>

                  <div>
                    <FieldLabel>Optional Entry Prompt</FieldLabel>
                    <Input
                      value={node.data.conversationalEscape.prompt ?? ""}
                      onChange={event =>
                        onChange("conversationalEscape", {
                          enabled: true,
                          ...node.data.conversationalEscape,
                          prompt: event.target.value,
                        })
                      }
                      placeholder="e.g. Sure, let me answer that for you."
                    />
                  </div>
                </div>
              )}
            </div>
          </PropertySection>
        )}

        {["KNOWLEDGE", "AI", "AI_CONVERSATION"].includes(nodeKind) && hasSection("BEHAVIOR") && (
          <PropertySection
            title="BEHAVIOR"
            description="Control when conversational AI is allowed to activate for this node."
          >
            <div>
              <FieldLabel>AI Mode</FieldLabel>
              <select
                value={node.data.aiPolicy?.mode ?? ""}
                onChange={event => {
                  const mode = event.target.value as IVRAIPolicyMode;
                  if (!mode) {
                    const updated = { ...node.data };
                    delete updated.aiPolicy;
                    onChange("aiPolicy", undefined);
                  } else {
                    onChange("aiPolicy", {
                      ...node.data.aiPolicy,
                      mode,
                      timeoutMs: node.data.aiPolicy?.timeoutMs ?? 8000,
                      failureBehavior: node.data.aiPolicy?.failureBehavior ?? "LOCAL_KB",
                      confidenceThreshold: node.data.aiPolicy?.confidenceThreshold ?? 0.7,
                      allowRerank: node.data.aiPolicy?.allowRerank !== false,
                    });
                  }
                }}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Default (Follow system heuristics)</option>
                <option value="NEVER">Never use AI (Deterministic only)</option>
                <option value="FREE_FORM_ONLY">Only for caller questions</option>
                <option value="LOW_CONFIDENCE_ONLY">Use AI when local answer is uncertain</option>
                <option value="ALWAYS_CONVERSATIONAL">Conversational AI</option>
              </select>
            </div>

            {node.data.aiPolicy?.mode && (
              <div className="mt-3 space-y-3">
                {node.data.aiPolicy.mode === "LOW_CONFIDENCE_ONLY" && (
                  <div>
                    <FieldLabel>Confidence Threshold (0.0 – 1.0)</FieldLabel>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={node.data.aiPolicy.confidenceThreshold ?? 0.7}
                      onChange={event =>
                        onChange("aiPolicy", {
                          mode: node.data.aiPolicy?.mode ?? "LOW_CONFIDENCE_ONLY",
                          ...node.data.aiPolicy,
                          confidenceThreshold: parseFloat(event.target.value) || 0.7,
                        })
                      }
                      placeholder="0.7"
                    />
                    <p className="mt-1 text-xs text-slate-500">Local answers with normalized relevance ≥ this threshold skip AI generation.</p>
                  </div>
                )}

                <div>
                  <FieldLabel>AI Timeout (ms)</FieldLabel>
                  <Input
                    type="number"
                    step="500"
                    min="500"
                    max="30000"
                    value={node.data.aiPolicy.timeoutMs ?? 8000}
                    onChange={event =>
                      onChange("aiPolicy", {
                        mode: node.data.aiPolicy?.mode ?? "FREE_FORM_ONLY",
                        ...node.data.aiPolicy,
                        timeoutMs: parseInt(event.target.value, 10) || 8000,
                      })
                    }
                    placeholder="8000"
                  />
                  <p className="mt-1 text-xs text-slate-500">Maximum milliseconds to wait for AI response before triggering failure behavior.</p>
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={node.data.aiPolicy.allowRerank !== false}
                    onChange={event =>
                      onChange("aiPolicy", {
                        mode: node.data.aiPolicy?.mode ?? "FREE_FORM_ONLY",
                        ...node.data.aiPolicy,
                        allowRerank: event.target.checked,
                      })
                    }
                  />
                  Allow AI Reranking
                </label>

                <div>
                  <FieldLabel>Failure Behavior</FieldLabel>
                  <select
                    value={node.data.aiPolicy.failureBehavior ?? "LOCAL_KB"}
                    onChange={event =>
                      onChange("aiPolicy", {
                        mode: node.data.aiPolicy?.mode ?? "FREE_FORM_ONLY",
                        ...node.data.aiPolicy,
                        failureBehavior: event.target.value as IVRAIFailureBehavior,
                      })
                    }
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="LOCAL_KB">Use Local Knowledge Base</option>
                    <option value="RETURN_CONTEXT">Return to Prior Context</option>
                    <option value="TRANSFER">Transfer to Agent</option>
                    <option value="CUSTOM_DESTINATION">Route to Custom Node</option>
                  </select>
                </div>

                {node.data.aiPolicy.failureBehavior === "CUSTOM_DESTINATION" && (
                  <div>
                    <FieldLabel>Failure Target Node</FieldLabel>
                    <NodeDestinationPicker
                      nodes={nodes}
                      value={node.data.aiPolicy.failureTargetNodeId}
                      onChange={val =>
                        onChange("aiPolicy", {
                          mode: node.data.aiPolicy?.mode ?? "FREE_FORM_ONLY",
                          ...node.data.aiPolicy,
                          failureTargetNodeId: val,
                        })
                      }
                      placeholder="Select failure fallback node..."
                      excludeNodeId={node.id}
                    />
                    <p className="mt-1 text-xs text-slate-500">Node to navigate to if AI generation times out or fails.</p>
                  </div>
                )}
              </div>
            )}
          </PropertySection>
        )}

        {(isAiConversation || nodeKind === "KNOWLEDGE") && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Knowledge is limited to tenant-approved documents and validated before publication.">
            <p className="text-xs leading-5 text-slate-600">Runtime infrastructure and provider credentials are intentionally managed outside this flow editor.</p>
          </PropertySection>
        )}

        {nodeKind === "ACTION" && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Only approved business tools from the tenant catalog can be selected.">
            <p className="text-xs leading-5 text-slate-600">Tool authorization and any required authentication are enforced by the approved action definition.</p>
          </PropertySection>
        )}

        {isTransfer && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Control the caller confirmation and unavailable-agent safeguard.">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={node.data.callbackEnabled !== false} onChange={event => onChange("callbackEnabled", event.target.checked)} /> Offer callback if unavailable</label>
            <div>
              <FieldLabel>Confirmation Prompt</FieldLabel>
              <Textarea rows={3} value={node.data.confirmationPrompt ?? ""} onChange={event => onChange("confirmationPrompt", event.target.value)} placeholder="Connecting you to an agent." />
            </div>
          </PropertySection>
        )}

        {nodeKind === "CALLBACK" && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Keep callback collection and confirmation explicit for the caller.">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={node.data.enabled !== false} onChange={event => onChange("enabled", event.target.checked)} /> Enable callback</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={node.data.preferredTimeCapture !== false} onChange={event => onChange("preferredTimeCapture", event.target.checked)} /> Capture preferred callback window</label>
            <div>
              <FieldLabel>Timezone Policy</FieldLabel>
              <select value={node.data.timezonePolicy ?? "TENANT"} onChange={event => onChange("timezonePolicy", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="TENANT">Tenant timezone</option><option value="CALLER">Caller-provided timezone</option>
              </select>
            </div>
            <div>
              <FieldLabel>Confirmation Prompt</FieldLabel>
              <Textarea rows={3} value={node.data.confirmationPrompt ?? ""} onChange={event => onChange("confirmationPrompt", event.target.value)} placeholder="Would you like us to call you back?" />
            </div>
          </PropertySection>
        )}

        {nodeKind === "SEND_INFORMATION" && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Send only content that has been approved for this tenant.">
            <div>
              <FieldLabel>Approved Content Template</FieldLabel>
              <select value={node.data.sendInformationTemplateId ?? ""} onChange={event => onChange("sendInformationTemplateId", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select approved content</option>
                {templateOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </PropertySection>
        )}

        {nodeKind === "AUTH_GATE" && hasSection("SAFETY") && (
          <PropertySection title="SAFETY" description="Set the minimum authentication level before protected routes continue.">
            <div>
              <FieldLabel>Minimum Authentication Level</FieldLabel>
              <select value={node.data.requiredAuthLevel ?? node.data.minimumAuthLevel ?? node.data.authLevel ?? node.data.authenticationLevel ?? ""} onChange={event => onChange("requiredAuthLevel", event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="">Select auth level</option>
                {authLevels.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
          </PropertySection>
        )}

        {isTransfer && hasSection("ADVANCED") && (
          <PropertySection title="ADVANCED" description="Optional destination capabilities and availability policy.">
            <div>
              <FieldLabel>Destination Type</FieldLabel>
              <select value={node.data.destinationType ?? "PHONE"} onChange={event => onChange("destinationType", event.target.value as IVRNodeData["destinationType"])} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="PHONE">Phone</option><option value="SIP">SIP</option><option value="USER">Agent user</option>
              </select>
            </div>
            <div>
              <FieldLabel>Business-hours Policy</FieldLabel>
              <select value={node.data.businessHoursPolicy ?? node.data.businessHoursPolicyId ?? ""} onChange={event => { onChange("businessHoursPolicy", event.target.value); onChange("businessHoursPolicyId", event.target.value); }} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="">Always available</option>
                {businessHoursOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </PropertySection>
        )}

        <div aria-label="Available tenant resources" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="mb-2 font-medium text-slate-700">Available tenant resources</p>
          <div>{knowledgeOptions.length} knowledge docs</div>
          <div>{actionOptions.length} actions</div>
          <div>{transferOptions.length} transfer destinations</div>
          <div>{inboundProfileOptions.length} inbound profiles</div>
          <div>{campaignOptions.length} campaigns</div>
        </div>

        <div className="flex gap-2">
          <Button className="w-full" type="button" disabled>Save</Button>
        </div>
      </div>
    </aside>
  );
}
