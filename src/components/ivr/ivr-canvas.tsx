"use client";

import "@xyflow/react/dist/style.css";

import {
  useEffect,
  useState,
} from "react";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";

import {
  toast,
} from "sonner";

import {
  useFlow,
} from "@/features/ivr/use-flow";

import {
  usePublishFlow,
} from "@/features/ivr/use-publish-flow";

import {
  useSaveFlow,
} from "@/features/ivr/use-save-flow";

import {
  useUpdateFlow,
} from "@/features/ivr/use-update-flow";

import AIPropertiesPanel from "./properties/ai-properties-panel";

import DTMFMenuPropertiesPanel from "./dtmf-menu-properties-panel";

import {
  defaultEdgeOptions,
} from "./edge-options";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

import IVRNode from "./ivr-node";

import IVRToolbar from "./ivr-toolbar";

import type {
  IVRNode as IVRFlowNode,
  IVRNodeData,
  IVRNodeKind,
  IVRRuntimeMenuConfig,
} from "./types";

//--------------------------------------------------
// React Flow Nodes
//--------------------------------------------------

const nodeTypes = {
  ivr:
    IVRNode,
};

//--------------------------------------------------
// Default Runtime Menu
//--------------------------------------------------

function createDefaultRuntimeMenu():
  IVRRuntimeMenuConfig {
  return {
    type:
      "DTMF_MENU",

    prompt:
      "Press 1 for loan information, 2 for deposits, 3 for branch information, 4 to request a callback, 9 for a human agent.",

    invalidPrompt:
      "That option is not available. Please try again.",

    timeoutPrompt:
      "I did not receive a selection. Please try again.",

    exhaustedPrompt:
      "I am having trouble receiving your keypad selection. Please continue using the voice assistant.",

    maxAttempts:
      3,

    options: [
      {
        digit:
          "1",

        action:
          "LOAN_INFORMATION",

        label:
          "Loan information",

        response:
          "You selected loan information.",
      },

      {
        digit:
          "2",

        action:
          "DEPOSIT_INFORMATION",

        label:
          "Deposit information",

        response:
          "You selected deposit information.",
      },

      {
        digit:
          "3",

        action:
          "BRANCH_INFORMATION",

        label:
          "Branch information",

        response:
          "You selected branch information.",
      },

      {
        digit:
          "4",

        action:
          "REQUEST_CALLBACK",

        label:
          "Request callback",

        response:
          "You selected callback.",
      },

      {
        digit:
          "9",

        action:
          "HUMAN_AGENT",

        label:
          "Human agent",

        response:
          "I will connect you to an agent.",
      },

      {
        digit:
          "0",

        action:
          "REPEAT_MENU",

        label:
          "Repeat menu",

        response:
          "Repeating the menu.",
      },
    ],
  };
}

//--------------------------------------------------
// Node Factory
//--------------------------------------------------

function createNodeData(
  label: string
): IVRNodeData {
  const normalized =
    label.trim();

  //------------------------------------------------
  // Greeting
  //------------------------------------------------

  if (
    normalized ===
    "Greeting"
  ) {
    return {
      nodeKind:
        "GREETING",

      label:
        "Greeting",

      description:
        "Play a greeting to the caller.",

      prompt:
        "Welcome. How may I help you today?",
    };
  }

  //------------------------------------------------
  // AI
  //------------------------------------------------

  if (
    normalized ===
    "AI Prompt"
  ) {
    return {
      nodeKind:
        "AI",

      label:
        "AI Assistant",

      description:
        "Continue into conversational AI.",

      prompt:
        "",

      provider:
        "Gemini",

      voice:
        "Kore",

      language:
        "English",

      speed:
        1,

      pitch:
        0,

      temperature:
        0.7,

      topP:
        1,

      maxTokens:
        1024,

      presencePenalty:
        0,

      frequencyPenalty:
        0,

      knowledge:
        [],
    };
  }

  //------------------------------------------------
  // DTMF
  //------------------------------------------------

  if (
    normalized ===
    "Collect Input"
  ) {
    return {
      nodeKind:
        "DTMF_MENU",

      label:
        "Keypad Menu",

      description:
        "Collect a keypad selection.",

      runtimeMenu:
        createDefaultRuntimeMenu(),
    };
  }

  //------------------------------------------------
  // Transfer
  //------------------------------------------------

  if (
    normalized ===
    "Transfer"
  ) {
    return {
      nodeKind:
        "TRANSFER",

      label:
        "Human Transfer",

      description:
        "Request transfer to a human agent.",
    };
  }

  //------------------------------------------------
  // End
  //------------------------------------------------

  if (
    normalized ===
    "End Call"
  ) {
    return {
      nodeKind:
        "END_CALL",

      label:
        "End Call",

      description:
        "Gracefully end the call.",

      prompt:
        "Thank you for calling. Goodbye.",
    };
  }

  //------------------------------------------------
  // Fallback
  //------------------------------------------------

  return {
    nodeKind:
      "AI",

    label:
      normalized ||
      "AI Assistant",

    description:
      "Configure this IVR node.",
  };
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

  const {
    nodes,
    setNodes,

    edges,
    setEdges,

    selectedFlow,
    setSelectedFlow,

    flowName,
    setFlowName,

    campaignId,
    setCampaignId,

    onConnect,
  } =
    useIVRBuilder();

  const saveFlow =
    useSaveFlow();

  const updateFlow =
    useUpdateFlow();

  const publishFlow =
    usePublishFlow();

  const {
    data:
      flow,
  } =
    useFlow(
      selectedFlow
    );

  //------------------------------------------------
  // Load Existing Flow
  //--------------------------------------------------

  useEffect(
    () => {
      if (
        !flow
      ) {
        return;
      }

      setNodes(
        flow.nodes ??
          []
      );

      setEdges(
        flow.edges ??
          []
      );

      setFlowName(
        flow.name ??
          "Untitled Flow"
      );

      setCampaignId(
        flow.campaignId ??
          ""
      );

      setSelectedNode(
        null
      );
    },
    [
      flow,
      setNodes,
      setEdges,
      setFlowName,
      setCampaignId,
    ]
  );

  //------------------------------------------------
  // Save
  //--------------------------------------------------

  function handleSave():
    void {
    const normalizedName =
      flowName.trim();

    if (
      !normalizedName
    ) {
      toast.error(
        "Enter a flow name."
      );

      return;
    }

    if (
      selectedFlow
    ) {
      updateFlow.mutate({
        id:
          selectedFlow,

        name:
          normalizedName,

        campaignId:
          campaignId.trim() ||
          null,

        nodes,

        edges,
      });

      return;
    }

    saveFlow.mutate(
      {
        name:
          normalizedName,

        campaignId:
          campaignId.trim() ||
          undefined,

        nodes,

        edges,
      },
      {
        onSuccess(
          created
        ) {
          if (
            created?.id
          ) {
            setSelectedFlow(
              created.id
            );
          }
        },
      }
    );
  }

  //------------------------------------------------
  // Publish
  //--------------------------------------------------

  function handlePublish():
    void {
    if (
      !selectedFlow
    ) {
      toast.error(
        "Save the flow before publishing it."
      );

      return;
    }

    if (
      !campaignId.trim()
    ) {
      toast.error(
        "Assign this flow to a campaign before publishing."
      );

      return;
    }

    /*
     * Save the latest builder state first.
     */
    updateFlow.mutate(
      {
        id:
          selectedFlow,

        name:
          flowName.trim(),

        campaignId:
          campaignId.trim(),

        nodes,

        edges,
      },
      {
        onSuccess() {
          publishFlow.mutate(
            selectedFlow
          );
        },
      }
    );
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

    setNodes(
      previous =>
        previous.map(
          node => {
            if (
              node.id !==
              selectedNode.id
            ) {
              return node;
            }

            const updatedNode:
              IVRFlowNode =
              {
                ...node,

                data: {
                  ...node.data,

                  [field]:
                    value,
                },
              };

            setSelectedNode(
              updatedNode
            );

            return updatedNode;
          }
        )
    );
  }

  //------------------------------------------------
  // DTMF Update
  //--------------------------------------------------

  function updateRuntimeMenu(
    menu:
      IVRRuntimeMenuConfig
  ): void {
    updateNode(
      "runtimeMenu",
      menu
    );
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

        publishing={
          publishFlow.isPending
        }

        canPublish={
          Boolean(
            selectedFlow &&
            campaignId.trim()
          )
        }

        isPublished={
          Boolean(
            flow?.isPublished
          )
        }

        onSave={
          handleSave
        }

        onPublish={
          handlePublish
        }
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

            onNodeClick={
              (
                _event,
                node
              ) => {
                setSelectedNode(
                  node
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

        {selectedNode?.data
          .nodeKind ===
        "DTMF_MENU" ? (
          <DTMFMenuPropertiesPanel
            node={
              selectedNode
            }

            onChange={
              updateRuntimeMenu
            }
          />
        ) : selectedNode ? (
          <AIPropertiesPanel
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