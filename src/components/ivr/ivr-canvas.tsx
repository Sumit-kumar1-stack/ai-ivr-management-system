"use client";

import "@xyflow/react/dist/style.css";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";

import {
  toast,
} from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import {
  useFlow,
} from "@/features/ivr/use-flow";


import {
  useSaveFlow,
} from "@/features/ivr/use-save-flow";

import {
  useUpdateFlow,
} from "@/features/ivr/use-update-flow";

import FlowCopilotPanel from "./flow-copilot-panel";

import EdgePropertiesPanel from "./edge-properties-panel";
import NodePropertiesPanel from "./node-properties";
import IVRValidationPanel from "./ivr-validation-panel";
import IVRSimulatorPanel from "./ivr-simulator-panel";

import {
  defaultEdgeOptions,
} from "./edge-options";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

import IVRNode from "./ivr-node";

import IVRToolbar from "./ivr-toolbar";
import { duplicateIvrNode, edgeBusinessLabel, layoutIvrGraph, searchIvrNodes } from "./ivr-builder-graph-utils";
import { analyzeIvrNodeDeletion, deleteIvrNodeWithCleanup } from "./ivr-builder-delete-utils";

import type {
  IVREdge,
  IVREdgeData,
  IVRNode as IVRFlowNode,
  IVRNodeData,
  IVRRuntimeMenuConfig,
  IVRFlowVersionSummary,
} from "./types";

import { createDefaultRuntimeMenu } from "./default-runtime-menu";

//--------------------------------------------------
// React Flow Nodes
//--------------------------------------------------

const nodeTypes = {
  ivr:
    IVRNode,
};

//--------------------------------------------------
// Node Factory
//--------------------------------------------------

function createNodeData(label: string): IVRNodeData {
  const normalized = label.trim().toUpperCase();

  switch (normalized) {
    case "START":
    case "START NODE":
    case "INCOMING CALL":
      return {
        nodeKind: "START",
        label: "Start",
        description: "Entry point for the flow.",
      };

    case "GREETING":
      return {
        nodeKind: "GREETING",
        label: "Greeting",
        description: "Play a greeting to the caller.",
        greeting: "Welcome. How may I help you today?",
        prompt: "Welcome. How may I help you today?",
      };

    case "AI":
    case "AI PROMPT":
    case "AI CONVERSATION":
      return {
        nodeKind: "AI_CONVERSATION",
        label: "AI Conversation",
        description: "Continue into conversational AI.",
        prompt: "",
        provider: "Gemini",
        voice: "Kore",
        language: "English",
        speed: 1,
        pitch: 0,
        temperature: 0.7,
        topP: 1,
        maxTokens: 1024,
        presencePenalty: 0,
        frequencyPenalty: 0,
        knowledge: [],
        knowledgeDocumentIds: [],
      };

    case "KNOWLEDGE":
      return {
        nodeKind: "KNOWLEDGE",
        label: "Knowledge",
        description: "Respond using approved tenant knowledge.",
        prompt: "Answer the caller using approved documents.",
        knowledgeDocumentIds: [],
      };

    case "ACTION":
      return {
        nodeKind: "ACTION",
        label: "Action",
        description: "Trigger a configured campaign action.",
        actionCode: "SEND_INFORMATION",
      };

    case "CONDITION":
      return {
        nodeKind: "CONDITION",
        label: "Condition",
        description: "Route based on a flow condition.",
        conditionExpression: "outcome.intent === 'INTERESTED'",
      };

    case "HYBRID_MENU":
    case "DTMF_MENU":
    case "COLLECT INPUT": {
      const { options, ...runtimeMenu } = createDefaultRuntimeMenu();
      return {
        nodeKind: "HYBRID_MENU",
        label: "Hybrid Menu",
        description: "Collect keypad input or voice-aligned menu selection.",
        runtimeMenu,
        options,
        allowNaturalLanguageEscape: true,
      };
    }

    case "HUMAN_TRANSFER":
    case "TRANSFER":
      return {
        nodeKind: "HUMAN_TRANSFER",
        label: "Human Transfer",
        description: "Request transfer to a human agent.",
        transferDestinationId: "",
        destinationRef: "",
        destinationType: "PHONE",
        callbackEnabled: true,
      };

    case "CALLBACK":
      return {
        nodeKind: "CALLBACK",
        label: "Callback",
        description: "Offer a callback option.",
        callbackConfigId: "",
        enabled: true,
        preferredTimeCapture: true,
        timezonePolicy: "TENANT",
        prompt: "We can call you back instead.",
      };

    case "SEND_INFORMATION":
    case "SEND INFORMATION":
      return {
        nodeKind: "SEND_INFORMATION",
        label: "Send Information",
        description: "Send approved information to the caller.",
        sendInformationTemplateId: "",
        prompt: "We will send the requested information.",
      };

    case "BUSINESS_HOURS":
    case "BUSINESS HOURS":
      return {
        nodeKind: "BUSINESS_HOURS",
        label: "Business Hours",
        description: "Route according to business-hours policy.",
        businessHoursPolicyId: "",
        prompt: "Checking business hours.",
      };

    case "AUTH_GATE":
    case "AUTH GATE":
    case "AUTHENTICATION GATE":
      return {
        nodeKind: "AUTH_GATE",
        label: "Authentication Gate",
        description: "Require the caller to authenticate.",
        requiredAuthLevel: "",
        prompt: "Please complete authentication.",
      };

    case "END CALL":
    case "END_CALL":
      return {
        nodeKind: "END_CALL",
        label: "End Call",
        description: "Gracefully end the call.",
        prompt: "Thank you for calling. Goodbye.",
      };

    default:
      return {
        nodeKind: "AI_CONVERSATION",
        label: label.trim() || "AI Conversation",
        description: "Configure this IVR node.",
      };
  }
}

//--------------------------------------------------
// Canvas
//--------------------------------------------------

export default function IVRCanvas() {
  const [
    selectedNode,
    setSelectedNode,
  ] =
    useState<
      IVRFlowNode | null
    >(
      null
    );

  const [
    selectedEdge,
    setSelectedEdge,
  ] =
    useState<
      IVREdge | null
    >(
      null
    );

  const [
    inspectorMode,
    setInspectorMode,
  ] =
    useState<
      "PROPERTIES" | "VALIDATION" | "SIMULATOR"
    >(
      "PROPERTIES"
    );

  const {
    nodes,
    setNodes,

    edges,
    setEdges,

    selectedFlow,
    setSelectedFlow,

    setSelectedPublishedVersionId,

    flowName,
    setFlowName,

    setCampaignId,
    builderContext,
    saveState,
    setSaveState,
    markDirty,
    markSaved,
    isDirty,

    mode,

    onConnect,
    onNodesChange,
    onEdgesChange,
    commitGraph,
    canUndo,
    canRedo,
    undo,
    redo,
  } =
    useIVRBuilder();

  const queryClient = useQueryClient();
  const lastLoadedFlowIdRef = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const searchResults = searchIvrNodes(nodes, searchQuery);

  function focusNodeById(id: string): void {
    const node = nodes.find(candidate => candidate.id === id);
    if (!node) return;
    setSelectedNode(node);
    setSelectedEdge(null);
    setInspectorMode("PROPERTIES");
    reactFlow?.setCenter(node.position.x + 130, node.position.y + 70, { zoom: 1.1, duration: 250 });
  }

  function handleAutoLayout(): void {
    if (selectedFlow && !flow?.permissions?.canEdit) return;
    commitGraph({ nodes: layoutIvrGraph(nodes, edges), edges });
  }

  function handleDuplicate(): void {
    if (!selectedNode || (selectedFlow && !flow?.permissions?.canEdit)) return;
    const copy = duplicateIvrNode(selectedNode, nodes);
    commitGraph({ nodes: [...nodes, copy], edges });
    setSelectedNode(copy);
  }

  function focusSearchResult(id: string): void {
    setSearchQuery("");
    focusNodeById(id);
  }

  function handleDelete(): void {
    if (!selectedNode) return;
    const editable = !selectedFlow || Boolean(flow?.permissions?.canEdit);
    const impact = analyzeIvrNodeDeletion(nodes, edges, selectedNode.id, { isEditable: editable });
    if (!impact.canDelete) { toast.error(impact.blockedReason === "START_NODE" ? "The Start node cannot be deleted." : "This flow is read-only."); return; }
    if (impact.requiresConfirmation && !window.confirm(`Delete ${impact.nodeLabel}? This removes ${impact.incomingEdges.length} incoming and ${impact.outgoingEdges.length} outgoing route(s).`)) return;
    const result = deleteIvrNodeWithCleanup(nodes, edges, selectedNode.id, { isEditable: editable });
    if (result.deleted) { commitGraph({ nodes: result.nodes, edges: result.edges }); setSelectedNode(null); }
  }

  const saveFlow =
    useSaveFlow();

  const updateFlow =
    useUpdateFlow();

  const {
    data:
      flow,
    refetch: refetchFlow,
  } =
    useFlow(
      selectedFlow
    );

  useEffect(() => {
    if (saveState !== "UNSAVED" && saveState !== "FAILED") {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveState]);

  //------------------------------------------------
  // Load Existing Flow (Only when flow identity changes)
  //--------------------------------------------------

  useEffect(() => {
    if (!flow) {
      return;
    }

    if (flow.id === lastLoadedFlowIdRef.current) {
      return;
    }

    lastLoadedFlowIdRef.current = flow.id;

    setNodes(Array.isArray(flow.nodes) ? flow.nodes : []);
    setEdges(Array.isArray(flow.edges) ? flow.edges : []);
    setFlowName(flow.name ?? "Untitled Flow");
    setCampaignId(
      builderContext.kind === "CAMPAIGN"
        ? builderContext.campaignId ?? ""
        : flow.campaignId ?? ""
    );
    setSelectedPublishedVersionId(
      flow.versions?.find(
        (version: IVRFlowVersionSummary) =>
          version.status === "PUBLISHED" &&
          version.versionNumber === flow.version
      )?.id ?? null
    );
    markSaved();
    setSelectedNode(null);
    setSelectedEdge(null);
    setInspectorMode("PROPERTIES");
  }, [
    flow,
    setNodes,
    setEdges,
    setFlowName,
    setCampaignId,
    setSelectedPublishedVersionId,
    markSaved,
    builderContext,
  ]);

  //------------------------------------------------
  // Persist Current Draft
  //--------------------------------------------------

  async function persistCurrentDraft(): Promise<string | null> {
    if (saveFlow.isPending || updateFlow.isPending) {
      return null;
    }

    const normalizedName = flowName.trim();
    if (!normalizedName) {
      toast.error("Enter a flow name.");
      return null;
    }

    setSaveState("SAVING");

    try {
      if (selectedFlow) {
        await updateFlow.mutateAsync({
          id: selectedFlow,
          name: normalizedName,
          nodes,
          edges,
        });
        lastLoadedFlowIdRef.current = selectedFlow;
        markSaved();
        return selectedFlow;
      } else {
        const created = await saveFlow.mutateAsync({
          name: normalizedName,
          nodes,
          edges,
          context: builderContext,
        });
        if (created?.id) {
          lastLoadedFlowIdRef.current = created.id;
          setSelectedFlow(created.id);
          setSelectedPublishedVersionId(null);
          markSaved();
          return created.id;
        }
        markSaved();
        return null;
      }
    } catch {
      setSaveState("FAILED");
      return null;
    }
  }

  function handleSave(): void {
    void persistCurrentDraft();
  }

  async function handleSaveAndValidate(): Promise<void> {
    if (saveFlow.isPending || updateFlow.isPending) {
      return;
    }

    let targetFlowId = selectedFlow;
    if (!targetFlowId || isDirty || saveState !== "SAVED") {
      const savedId = await persistCurrentDraft();
      if (!savedId) {
        return;
      }
      targetFlowId = savedId;
    }

    setInspectorMode("VALIDATION");
    setSelectedNode(null);
    setSelectedEdge(null);
  }

  async function handleSubmitForApproval(): Promise<void> {
    if (!selectedFlow || submitting) {
      toast.error("Save and validate the flow before submitting it for approval.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/ivr-flows/${encodeURIComponent(selectedFlow)}/governance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? "The IVR flow could not be submitted for approval.");
      }
      toast.success("IVR flow submitted for approval.");
      await refetchFlow();
      queryClient.invalidateQueries({ queryKey: ["ivr-flow", selectedFlow] });
      queryClient.invalidateQueries({ queryKey: ["ivr-flows"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The IVR flow could not be submitted for approval.");
    } finally {
      setSubmitting(false);
    }
  }

  //------------------------------------------------
  // Update Node
  //--------------------------------------------------

  function updateNode<
    K extends keyof IVRNodeData
  >(
    field: K,
    value:
      IVRNodeData[K]
  ): void {
    if (
      !selectedNode
    ) {
      return;
    }

    commitGraph({ nodes: nodes.map(
          node => {
            if (
              node.id !==
              selectedNode.id
            ) {
              return node;
            }

            const data = {
              ...node.data,
              [field]: value,
            };
            if (field === "transferDestinationId") {
              // Upgrade a legacy draft when it is edited. New graphs persist
              // only the canonical transferDestinationId field.
              delete data.destinationId;
              delete data.humanTransferDestinationId;
            }
            const updatedNode: IVRFlowNode = {
              ...node,
              data,
            };

            setSelectedNode(
              updatedNode
            );

            return updatedNode;
          }
        ), edges });
  }

  //------------------------------------------------
  // Update Edge
  //------------------------------------------------

  function updateEdge(
    data:
      IVREdgeData
  ): void {
    if (
      !selectedEdge
    ) {
      return;
    }

    setEdges(
      previous =>
        previous.map(
          edge =>
            edge.id ===
            selectedEdge.id
              ? {
                  ...edge,

                  data,
                }
              : edge
        )
    );

    setSelectedEdge(
      previous =>
        previous
          ? {
              ...previous,

              data,
            }
          : previous
    );
    markDirty();
  }

  //------------------------------------------------
  // Drop
  //--------------------------------------------------

  function onDrop(
    event:
      React.DragEvent
  ): void {
    event.preventDefault();

    const label =
      event.dataTransfer
        .getData(
          "application/reactflow"
        );

    if (
      !label
    ) {
      return;
    }

    const nodeData =
      createNodeData(
        label
      );

    const nodeKind =
      nodeData.nodeKind;

    const node:
      IVRFlowNode =
      {
        id:
          crypto.randomUUID(),

        type:
          "ivr",

        position: {
          x:
            Math.max(
              0,
              event.clientX -
                320
            ),

          y:
            Math.max(
              0,
              event.clientY -
                90
            ),
        },

        data:
          nodeData,
      };

    if (
      nodeKind ===
      "START"
    ) {
      return;
    }

    setNodes(
      previous => [
        ...previous,
        node,
      ]
    );
    markDirty();
  }

  //------------------------------------------------
  // Render
  //--------------------------------------------------

  return (
    <div className="flex flex-1 flex-col">

      <IVRToolbar
        saving={
          saveFlow.isPending ||
          updateFlow.isPending
        }

        submitting={submitting}

        canSubmit={Boolean(
          selectedFlow &&
          !isDirty &&
          saveState === "SAVED" &&
          flow?.lifecycle === "VALIDATED" &&
          flow?.validationStatus === "VALID" &&
          flow?.permissions?.canSubmit
        )}

        canEdit={Boolean(!selectedFlow || flow?.permissions?.canEdit)}

        isPublished={
          Boolean(
            flow?.isPublished
          )
        }

        onSave={
          handleSave
        }

        onSubmitForApproval={() => void handleSubmitForApproval()}

        onShowProperties={
          () => {
            setInspectorMode("PROPERTIES");
            setSelectedEdge(null);
          }
        }

        onShowValidation={
          () => {
            void handleSaveAndValidate();
          }
        }

        onShowSimulator={
          () => {
            setInspectorMode("SIMULATOR");
            setSelectedNode(null);
            setSelectedEdge(null);
          }
        }
        onAutoLayout={handleAutoLayout}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={searchResults.map(node => ({ id: node.id, label: `${node.data.label ?? node.id} · ${node.data.nodeKind ?? "Node"}` }))}
        onSearchResult={focusSearchResult}
        onDuplicate={handleDuplicate}
        canDuplicate={Boolean(selectedNode && (!selectedFlow || flow?.permissions?.canEdit))}
        onDelete={handleDelete}
        canDelete={Boolean(selectedNode && (!selectedFlow || flow?.permissions?.canEdit) && selectedNode.data.nodeKind !== "START")}

      />

      <div
        className="flex flex-1"
        onDrop={
          onDrop
        }
        onDragOver={
          event =>
            event.preventDefault()
        }
      >

        <div className="flex-1">

          <ReactFlow
            onInit={setReactFlow}
            nodes={
              nodes
            }

            edges={
              edges
            }

            nodeTypes={
              nodeTypes
            }

            onConnect={
              onConnect
            }

            onNodesChange={
              onNodesChange
            }

            onEdgesChange={
              onEdgesChange
            }

            onNodeClick={
              (
                _event,
                node
              ) => {
                setSelectedNode(
                  node
                );

                setSelectedEdge(
                  null
                );

                setInspectorMode(
                  "PROPERTIES"
                );
              }
            }

            onEdgeClick={
              (
                _event,
                edge
              ) => {
                setSelectedEdge(
                  edge
                );

                setSelectedNode(
                  null
                );

                setInspectorMode(
                  "PROPERTIES"
                );
              }
            }

            defaultEdgeOptions={
              defaultEdgeOptions
            }

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

        {mode === "AI" ? (
          <FlowCopilotPanel />
        ) : inspectorMode === "VALIDATION" ? (
          <IVRValidationPanel
            flowId={
              selectedFlow
            }
            isDirty={isDirty}
            onFocusNode={focusNodeById}
            onClose={() => setInspectorMode("PROPERTIES")}
            onSaveAndValidate={handleSaveAndValidate}
          />
        ) : inspectorMode === "SIMULATOR" ? (
          <IVRSimulatorPanel
            flowId={
              selectedFlow
            }

            nodes={
              nodes
            }

            edges={
              edges.map(edge => ({ ...edge, label: edgeBusinessLabel(edge, nodes), labelStyle: { fill: "#334155", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 } }))
            }
            onFocusNode={focusNodeById}
            onClose={() => setInspectorMode("PROPERTIES")}
          />
        ) : selectedEdge ? (
          <EdgePropertiesPanel
            edge={
              selectedEdge
            }

            onChange={
              updateEdge
            }
          />
        ) : selectedNode ? (
          <NodePropertiesPanel
            node={
              selectedNode
            }

            onChange={
              updateNode
            }
          />
        ) : null}

      </div>

    </div>
  );
}
