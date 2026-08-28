import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  triggerCampaignActionForVoiceOutcome,
} from "@/services/communication/campaign-action-resolver.service";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

import {
  orchestrateHumanTransfer,
} from "@/services/telephony/human-transfer-orchestrator.service";

import {
  IVRFlowSessionService,
} from "./ivr-flow-session.service";

import type {
  ConversationVoiceOutcome,
} from "@/services/conversations/voice-outcome.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface IVRFlowTransitionResult {
  matched:
    boolean;

  consumed:
    boolean;

  response:
    string | null;

  nextNodeId:
    string | null;

  nextNodeKind:
    string | null;

  trigger:
    string | null;

  value:
    string | null;
}

interface FlowNodeRecord {
  id:
    string;

  data?: {
    nodeKind?:
      string;

    label?:
      string;

    prompt?:
      string;

    actionCode?:
      string;

    conditionExpression?:
      string;
  };
}

interface FlowEdgeRecord {
  id?:
    string;

  source:
    string;

  target:
    string;

  data?:
    {
      trigger?:
        string;

      value?:
        string;

      label?:
        string;
    };
}

//--------------------------------------------------
// Resolve Transition
//--------------------------------------------------

export async function resolveVoiceIntentFlowTransition(
  callId:
    string,

  outcome:
    ConversationVoiceOutcome,

  turnId?:
    number
): Promise<IVRFlowTransitionResult> {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return noTransition();
  }

  const log =
    createCallLogger(
      normalizedCallId
    );

  try {
    const call =
      await getCall(
        normalizedCallId
      );

    if (
      !call?.campaignId
    ) {
      return noTransition();
    }

    // Calls are pinned at creation. Legacy calls retain the prior campaign lookup.
    const flow =
      call.ivrFlowVersion ??
      await IVRFlowService
        .findPublishedForCampaign(
          call.campaignId
        );

    if (
      !flow
    ) {
      return noTransition();
    }

    const nodes =
      normalizeNodes(
        flow.nodes
      );

    const edges =
      normalizeEdges(
        flow.edges
      );

    if (
      nodes.length ===
      0
    ) {
      return noTransition();
    }

    const nodeById =
      new Map(
        nodes.map(
          node => [
            node.id,
            node,
          ] as const
        )
      );

    const currentState =
      await IVRFlowSessionService
        .get(
          normalizedCallId
        );

    const startNode =
      nodes.find(
        node =>
          node.data
            ?.nodeKind ===
          "START"
      ) ??
      nodes[0];

    const activeNode =
      currentState?.flowId ===
      flow.id
        ? nodeById.get(
            currentState.currentNodeId ??
              ""
          ) ?? startNode
        : startNode;

    if (
      !activeNode
    ) {
      return noTransition();
    }

    const outgoing =
      edges.filter(
        edge =>
          edge.source ===
          activeNode.id
      );

    const selectedEdge =
      selectTransitionEdge(
        outgoing,
        outcome
      );

    if (
      !selectedEdge
    ) {
      await IVRFlowSessionService.set(
        normalizedCallId,
        {
          flowId:
            flow.id,

          previousNodeId:
            activeNode.id,

          currentNodeId:
            activeNode.id,

          lastTrigger:
            null,

          lastValue:
            null,

          navigationHistory:
            [...(currentState?.navigationHistory ?? []), activeNode.id]
              .slice(-10),
        }
      );

      return noTransition();
    }

    const nextNode =
      nodeById.get(
        selectedEdge.target
      ) ?? null;

    await IVRFlowSessionService.set(
      normalizedCallId,
      {
        flowId:
          flow.id,

        previousNodeId:
          activeNode.id,

        currentNodeId:
          nextNode?.id ??
          selectedEdge.target,

        lastTrigger:
          selectedEdge.data
            ?.trigger ??
          null,

        lastValue:
          selectedEdge.data
            ?.value ??
          null,

        navigationHistory:
          [...(currentState?.navigationHistory ?? []), activeNode.id]
            .slice(-10),
      }
    );

    if (
      !nextNode
    ) {
      log.warn(
        {
          event:
            "ivr.flow.transition_missing_target",

          sourceNodeId:
            activeNode.id,

          targetNodeId:
            selectedEdge.target,
        },
        "IVR flow transition target node was not found"
      );

      return {
        matched:
          true,

        consumed:
          false,

        response:
          null,

        nextNodeId:
          selectedEdge.target,

        nextNodeKind:
          null,

        trigger:
          selectedEdge.data
            ?.trigger ??
          null,

        value:
          selectedEdge.data
            ?.value ??
          null,
      };
    }

    const nextNodeKind =
      typeof nextNode.data
        ?.nodeKind ===
      "string"
        ? nextNode.data.nodeKind
        : null;

    const directResponse =
      typeof nextNode.data
        ?.prompt ===
      "string" &&
      nextNode.data.prompt.trim()
        ? nextNode.data.prompt.trim()
        : null;

    let response =
      directResponse;

    let consumed =
      Boolean(
        response
      );

    //------------------------------------------------
    // Action Node
    //------------------------------------------------

    if (
      nextNodeKind ===
      "ACTION" &&
      nextNode.data
        ?.actionCode
    ) {
      const syntheticOutcome =
        buildSyntheticOutcome(
          nextNode.data.actionCode,
          outcome
        );

      if (
        syntheticOutcome
      ) {
        const actionResult =
          await triggerCampaignActionForVoiceOutcome(
            normalizedCallId,
            syntheticOutcome,
            turnId
          );

        consumed =
          actionResult.matched ||
          consumed;

        if (
          !response &&
          actionResult.matched
        ) {
          response =
            syntheticOutcome.response ??
            null;
        }
      }
    }

    //------------------------------------------------
    // End Call Default
    //------------------------------------------------

    if (
      nextNodeKind ===
      "END_CALL" &&
      !response
    ) {
      response =
        "Thank you for calling. Goodbye.";

      consumed =
        true;
    }

    //------------------------------------------------
    // Transfer Default
    //------------------------------------------------

    if (
      nextNodeKind ===
      "TRANSFER" &&
      !response
    ) {
      const transfer =
        await orchestrateHumanTransfer(
          normalizedCallId,
          "IVR flow requested a human-agent transfer"
        );

      consumed =
        true;

      response =
        transfer.transferred
          ? null
          : transfer.message;
    }

    log.info(
      {
        event:
          "ivr.flow.transition_resolved",

        flowId:
          flow.id,

        sourceNodeId:
          activeNode.id,

        nextNodeId:
          nextNode.id,

        nextNodeKind,

        trigger:
          selectedEdge.data
            ?.trigger ??
          null,

        value:
          selectedEdge.data
            ?.value ??
          null,

        consumed,
      },
      "IVR flow transition resolved"
    );

    return {
      matched:
        true,

      consumed,

      response,

      nextNodeId:
        nextNode.id,

      nextNodeKind,

      trigger:
        selectedEdge.data
          ?.trigger ??
        null,

      value:
        selectedEdge.data
          ?.value ??
        null,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "ivr.flow.transition_failed",

        error:
          normalizeError(
            error
          ),
      },
      "IVR flow transition failed"
    );

    return noTransition();
  }
}

//--------------------------------------------------
// Edge Selection
//--------------------------------------------------

function selectTransitionEdge(
  edges:
    FlowEdgeRecord[],

  outcome:
    ConversationVoiceOutcome
): FlowEdgeRecord | null {
  if (
    edges.length ===
    0
  ) {
    return null;
  }

  const candidates =
    [
      outcome.intent,
      outcome.requestedAction,
    ]
      .map(
        value =>
          normalizeToken(
            value
          )
      )
      .filter(
        Boolean
      ) as string[];

  const voiceSpecific =
    edges.find(
      edge =>
        normalizeToken(
          edge.data?.trigger
        ) ===
          "VOICE_INTENT" &&
        Boolean(
          edge.data?.value
        ) &&
        candidates.includes(
          normalizeToken(
            edge.data?.value
          )
        )
    );

  if (
    voiceSpecific
  ) {
    return voiceSpecific;
  }

  const defaultEdge =
    edges.find(
      edge =>
        normalizeToken(
          edge.data
            ?.trigger
        ) ===
        "DEFAULT"
    );

  return defaultEdge ?? null;
}

//--------------------------------------------------
// Synthetic Outcome
//--------------------------------------------------

function buildSyntheticOutcome(
  actionCode:
    string,

  outcome:
    ConversationVoiceOutcome
): ConversationVoiceOutcome | null {
  const normalized =
    normalizeToken(
      actionCode
    );

  if (
    normalized ===
    "REQUEST_CALLBACK"
  ) {
    return {
      ...outcome,

      intent:
        "REQUEST_CALLBACK",

      requestedAction:
        "START_CALLBACK_WORKFLOW",

      handled:
        false,

      response:
        "I can help arrange a callback. Please tell me the phone number to use and your preferred callback time.",
    };
  }

  if (
    normalized ===
    "REQUEST_HUMAN"
  ) {
    return {
      ...outcome,

      intent:
        "REQUEST_HUMAN",

      requestedAction:
        "REQUEST_HUMAN",

      handled:
        true,

      response:
        "I can arrange assistance from a representative.",
    };
  }

  if (
    normalized ===
    "SEND_INFORMATION"
  ) {
    return {
      ...outcome,

      intent:
        "SEND_INFORMATION",

      requestedAction:
        "SEND_INFORMATION",

      handled:
        true,

      response:
        outcome.response ??
        "I will send that information.",
    };
  }

  if (
    normalized ===
    "CONTINUE_CONVERSATION"
  ) {
    return {
      ...outcome,

      intent:
        "CONTINUE_CONVERSATION",

      requestedAction:
        "CONTINUE_CONVERSATION",

      handled:
        false,

      response:
        null,
    };
  }

  if (
    normalized ===
    "INTERESTED"
  ) {
    return {
      ...outcome,

      intent:
        "INTERESTED",

      requestedAction:
        "CONTINUE_CONVERSATION",

      handled:
        false,

      response:
        null,
    };
  }

  if (
    normalized ===
    "NOT_INTERESTED"
  ) {
    return {
      ...outcome,

      intent:
        "NOT_INTERESTED",

      requestedAction:
        "CONTINUE_CONVERSATION",

      handled:
        true,

      response:
        "Okay. I'll note that.",
    };
  }

  return null;
}

//--------------------------------------------------
// Normalization
//--------------------------------------------------

function normalizeNodes(
  value:
    unknown
): FlowNodeRecord[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .filter(
      isRecord
    )
    .map(
      node => ({
        id:
          typeof node.id ===
            "string" &&
          node.id.trim()
            ? node.id.trim()
            : "",

        data:
          isRecord(
            node.data
          )
            ? {
                nodeKind:
                  typeof node.data.nodeKind ===
                    "string"
                    ? node.data.nodeKind
                    : undefined,

                label:
                  typeof node.data.label ===
                    "string"
                    ? node.data.label
                    : undefined,

                prompt:
                  typeof node.data.prompt ===
                    "string"
                    ? node.data.prompt
                    : undefined,

                actionCode:
                  typeof node.data.actionCode ===
                    "string"
                    ? node.data.actionCode
                    : undefined,

                conditionExpression:
                  typeof node.data.conditionExpression ===
                    "string"
                    ? node.data.conditionExpression
                    : undefined,
              }
            : undefined,
      })
    )
    .filter(
      node =>
        Boolean(
          node.id
        )
    );
}

function normalizeEdges(
  value:
    unknown
): FlowEdgeRecord[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .filter(
      isRecord
    )
    .map(
      edge => ({
        id:
          typeof edge.id ===
            "string" &&
          edge.id.trim()
            ? edge.id.trim()
            : undefined,

        source:
          typeof edge.source ===
            "string" &&
          edge.source.trim()
            ? edge.source.trim()
            : "",

        target:
          typeof edge.target ===
            "string" &&
          edge.target.trim()
            ? edge.target.trim()
            : "",

        data:
          isRecord(
            edge.data
          )
            ? {
                trigger:
                  typeof edge.data.trigger ===
                    "string"
                    ? edge.data.trigger
                    : undefined,

                value:
                  typeof edge.data.value ===
                    "string"
                    ? edge.data.value
                    : undefined,

                label:
                  typeof edge.data.label ===
                    "string"
                    ? edge.data.label
                    : undefined,
              }
            : undefined,
      })
    )
    .filter(
      edge =>
        Boolean(
          edge.source &&
            edge.target
        )
    );
}

function normalizeToken(
  value?:
    string | null
): string {
  return (
    value ?? ""
  )
    .trim()
    .toUpperCase();
}

function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}

function noTransition():
  IVRFlowTransitionResult {
  return {
    matched:
      false,

    consumed:
      false,

    response:
      null,

    nextNodeId:
      null,

    nextNodeKind:
      null,

    trigger:
      null,

    value:
      null,
  };
}
