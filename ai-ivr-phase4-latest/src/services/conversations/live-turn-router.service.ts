import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  ConversationEvents,
} from "./conversation-events.service";

import {
  ConversationService,
} from "./conversation.service";

import {
  ConversationStateService,
} from "./conversation-state.service";

import {
  routeBusinessWorkflowTurn,
} from "./business-workflow-turn-router.service";

import {
  resolveVoiceConversationOutcome,
  type ConversationVoiceOutcome,
} from "./voice-outcome.service";

import {
  triggerCampaignActionForVoiceOutcome,
} from "@/services/communication/campaign-action-resolver.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  resolveVoiceIntentFlowTransition,
} from "@/services/ivr/ivr-flow-graph.service";

import {
  orchestrateHumanTransfer,
} from "@/services/telephony/human-transfer-orchestrator.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface LiveTurnRouteResult {
  handled:
    boolean;

  response:
    string | null;

  reason:
    | "BUSINESS_WORKFLOW"
    | "NORMAL_CONVERSATION";

  audioQueued:
    boolean;

  outcome?:
    ConversationVoiceOutcome;
}

//--------------------------------------------------
// Route Live Turn
//--------------------------------------------------

export async function routeLiveTurn(
  callId:
    string,

  transcript:
    string,

  signal?:
    AbortSignal,

  turnId?:
    number
): Promise<LiveTurnRouteResult> {
  const normalized =
    transcript.trim();

  if (
    !normalized
  ) {
    return normalConversation();
  }

  const log =
    createCallLogger(
      callId
    );

  //--------------------------------------------------
  // Abort Before Work
  //--------------------------------------------------

  if (
    signal?.aborted
  ) {
    return normalConversation();
  }

  try {
    //------------------------------------------------
    // Business Workflow First
    //------------------------------------------------

    const business =
      await routeBusinessWorkflowTurn(
        callId,
        normalized,
        signal
      );

    //------------------------------------------------
    // Not A Workflow Turn
    //------------------------------------------------

    if (
      !business.handled
    ) {
      const outcome =
        await resolveVoiceConversationOutcome(
          callId,
          normalized
        );

      log.info(
        {
          event:
            "conversation.voice_outcome.resolved",

          intent:
            outcome.intent,

          confidence:
            outcome.confidence,

          requestedAction:
            outcome.requestedAction,

          requiresConfirmation:
            outcome.requiresConfirmation,

          handled:
            outcome.handled,

          responsePresent:
            Boolean(
              outcome.response
            ),
        },
        "Voice conversation outcome resolved"
      );

      void EventPublisher.publish(
        AppEvent.INTENT_DETECTED,
        {
          callId,

          intent:
            outcome.intent,

          confidence:
            outcome.confidence,

          requestedAction:
            outcome.requestedAction,

          requiresConfirmation:
            outcome.requiresConfirmation,

          handled:
            outcome.handled,

          actorType:
            "AI",

          timestamp:
            Date.now(),
        }
      );

      const flowTransition =
        await resolveVoiceIntentFlowTransition(
          callId,
          outcome,
          turnId
        );

      if (
        flowTransition.matched
      ) {
        log.info(
          {
            event:
              "conversation.ivr_flow.transitioned",

            nextNodeId:
              flowTransition.nextNodeId,

            nextNodeKind:
              flowTransition.nextNodeKind,

            trigger:
              flowTransition.trigger,

            value:
              flowTransition.value,

            consumed:
              flowTransition.consumed,
          },
          "Voice outcome matched an IVR flow transition"
        );

        if (
          flowTransition.response
        ) {
          await ConversationService.addMessage({
            callId,

            role:
              "USER",

            content:
              normalized,
          });

          await EventPublisher.publish(
            AppEvent.CONVERSATION_MESSAGE,
            {
              callId,

              role:
                "USER",

              text:
                normalized,

              timestamp:
                Date.now(),
            }
          );

          const audioSession =
            AudioSessionService
              .getByCallId(
                callId
              );

          await persistAssistantResponse(
            callId,
            flowTransition.response
          );

          if (
            audioSession
          ) {
            ConversationStateService.setState(
              callId,
              "THINKING"
            );

            ConversationEvents.emit(
              "thinking",
              callId
            );

            void VoiceWorker.start(
              callId
            );

            const audioQueued =
              await VoiceWorker.addText(
                callId,
                flowTransition.response,
                turnId
              );

            if (
              !audioQueued
            ) {
              returnToListening(
                callId
              );
            }

            return {
              handled:
                true,

              response:
                flowTransition.response,

              reason:
                "BUSINESS_WORKFLOW",

              audioQueued,

              outcome,
            };
          }

          return {
            handled:
              true,

            response:
              flowTransition.response,

            reason:
              "BUSINESS_WORKFLOW",

            audioQueued:
              false,

            outcome,
          };
        }

        return {
          handled:
            true,

          response:
            null,

          reason:
            "BUSINESS_WORKFLOW",

          audioQueued:
            false,

          outcome,
        };
      }

      //------------------------------------------------
      // Human Agent Request
      //------------------------------------------------

      const humanRequested =
        outcome.intent ===
          "REQUEST_HUMAN" ||
        outcome.requestedAction ===
          "REQUEST_HUMAN";

      if (
        humanRequested
      ) {
        const actionResult =
          await triggerCampaignActionForVoiceOutcome(
            callId,
            outcome,
            turnId
          );

        if (
          actionResult.matched &&
          !actionResult.executed &&
          actionResult.reason ===
            "confirmation_required"
        ) {
          const reply =
            outcome.response ??
            "Please confirm that you want me to connect you to a human agent.";

          await persistUserMessage(
            callId,
            normalized
          );

          await persistAssistantResponse(
            callId,
            reply
          );

          const audioSession =
            AudioSessionService
              .getByCallId(
                callId
              );

          if (
            audioSession
          ) {
            ConversationStateService.setState(
              callId,
              "THINKING"
            );

            ConversationEvents.emit(
              "thinking",
              callId
            );

            void VoiceWorker.start(
              callId
            );

            const audioQueued =
              await VoiceWorker.addText(
                callId,
                reply,
                turnId
              );

            if (
              !audioQueued
            ) {
              returnToListening(
                callId
              );
            }

            return {
              handled:
                true,

              response:
                reply,

              reason:
                "BUSINESS_WORKFLOW",

              audioQueued,

              outcome,
            };
          }

          return {
            handled:
              true,

            response:
              reply,

            reason:
              "BUSINESS_WORKFLOW",

            audioQueued:
              false,

            outcome,
          };
        }

        if (
          actionResult.executed
        ) {
          await persistUserMessage(
            callId,
            normalized
          );

          await persistAssistantResponse(
            callId,
            outcome.response ??
              "I will connect you now."
          );

          return {
            handled:
              true,

            response:
              null,

            reason:
              "BUSINESS_WORKFLOW",

            audioQueued:
              false,

            outcome,
          };
        }

        const transfer =
          await orchestrateHumanTransfer(
            callId,
            outcome.response ??
              "Caller requested a human agent"
          );

        await persistUserMessage(
          callId,
          normalized
        );

        await persistAssistantResponse(
          callId,
          transfer.message
        );

        if (
          transfer.transferred
        ) {
          return {
            handled:
              true,

            response:
              null,

            reason:
              "BUSINESS_WORKFLOW",

            audioQueued:
              false,

            outcome,
          };
        }

        const audioSession =
          AudioSessionService.getByCallId(
            callId
          );

        if (
          audioSession
        ) {
          ConversationStateService.setState(
            callId,
            "THINKING"
          );

          ConversationEvents.emit(
            "thinking",
            callId
          );

          void VoiceWorker.start(
            callId
          );

          const audioQueued =
            await VoiceWorker.addText(
              callId,
              transfer.message,
              turnId
            );

          if (
            !audioQueued
          ) {
            returnToListening(
              callId
            );
          }

          return {
            handled:
              true,

            response:
              transfer.message,

            reason:
              "BUSINESS_WORKFLOW",

            audioQueued,

            outcome,
          };
        }

        return {
          handled:
            true,

          response:
            transfer.message,

          reason:
            "BUSINESS_WORKFLOW",

          audioQueued:
            false,

          outcome,
        };
      }

      void triggerCampaignActionForVoiceOutcome(
        callId,
        outcome,
        turnId
      );

      if (
        outcome.handled
      ) {
        await ConversationService.addMessage({
          callId,

          role:
            "USER",

          content:
            normalized,
        });

        await EventPublisher.publish(
          AppEvent.CONVERSATION_MESSAGE,
          {
            callId,

            role:
              "USER",

            text:
              normalized,

            timestamp:
              Date.now(),
          }
        );

        if (
          outcome.response
        ) {
          const audioSession =
            AudioSessionService
              .getByCallId(
                callId
              );

          await persistAssistantResponse(
            callId,
            outcome.response
          );

          if (
            audioSession
          ) {
            ConversationStateService.setState(
              callId,
              "THINKING"
            );

            ConversationEvents.emit(
              "thinking",
              callId
            );

            void VoiceWorker.start(
              callId
            );

            const audioQueued =
              await VoiceWorker.addText(
                callId,
                outcome.response,
                turnId
              );

            if (
              !audioQueued
            ) {
              returnToListening(
                callId
              );
            }

            return {
              handled:
                true,

              response:
                outcome.response,

              reason:
                "NORMAL_CONVERSATION",

              audioQueued,

              outcome,
            };
          }

          log.warn(
            {
              event:
                "conversation.voice_outcome.response_not_spoken",

              intent:
                outcome.intent,

              requestedAction:
                outcome.requestedAction,

              reason:
                "audio_session_missing",
            },
            "Voice outcome response could not be spoken because audio session no longer exists"
          );

          return {
            handled:
              true,

            response:
              outcome.response,

            reason:
              "NORMAL_CONVERSATION",

            audioQueued:
              false,

            outcome,
          };
        }

        return {
          handled:
            true,

          response:
            null,

          reason:
            "NORMAL_CONVERSATION",

          audioQueued:
            false,

          outcome,
        };
      }

      return {
        ...normalConversation(),
        outcome,
      };
    }

    //------------------------------------------------
    // Abort After Workflow
    //------------------------------------------------

    if (
      signal?.aborted
    ) {
      return {
        handled:
          true,

        response:
          null,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Persist Customer Message
    //------------------------------------------------

    await ConversationService.addMessage({
      callId,

      role:
        "USER",

      content:
        normalized,
    });

    await EventPublisher.publish(
      AppEvent.CONVERSATION_MESSAGE,
      {
        callId,

        role:
          "USER",

        text:
          normalized,

        timestamp:
          Date.now(),
      }
    );

    //------------------------------------------------
    // No Spoken Response
    //------------------------------------------------

    const response =
      business.response
        ?.trim() ??
      "";

    if (
      !response
    ) {
      return {
        handled:
          true,

        response:
          null,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Verify Call Session Still Exists
    //------------------------------------------------

    const audioSession =
      AudioSessionService
        .getByCallId(
          callId
        );

    if (
      !audioSession
    ) {
      log.warn(
        {
          event:
            "conversation.workflow.response_not_spoken",

          reason:
            "audio_session_missing",

          workflowType:
            business.workflowType,
        },
        "Workflow response could not be spoken because audio session no longer exists"
      );

      //------------------------------------------------
      // Still Persist Assistant Response
      //------------------------------------------------

      await persistAssistantResponse(
        callId,
        response
      );

      return {
        handled:
          true,

        response,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Thinking State
    //------------------------------------------------

    ConversationStateService.setState(
      callId,
      "THINKING"
    );

    ConversationEvents.emit(
      "thinking",
      callId
    );

    //------------------------------------------------
    // Start Playback Runtime
    //------------------------------------------------

    void VoiceWorker.start(
      callId
    );

    //------------------------------------------------
    // Generate / Queue Speech
    //------------------------------------------------

    const audioQueued =
      await VoiceWorker.addText(
        callId,
        response,
        turnId
      );

    //------------------------------------------------
    // Abort Check After TTS
    //------------------------------------------------

    if (
      signal?.aborted
    ) {
      return {
        handled:
          true,

        response,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Persist Assistant Message
    //------------------------------------------------

    await persistAssistantResponse(
      callId,
      response
    );

    //------------------------------------------------
    // TTS Failed
    //------------------------------------------------

    if (
      !audioQueued
    ) {
      returnToListening(
        callId
      );
    }

    log.info(
      {
        event:
          "conversation.live_turn.routed",

        destination:
          "business_workflow",

        workflowType:
          business.workflowType,

        completed:
          business.completed,

        responseCharacterCount:
          response.length,

        audioQueued,
      },
      "Live customer turn handled by business workflow"
    );

    return {
      handled:
        true,

      response,

      reason:
        "BUSINESS_WORKFLOW",

      audioQueued,

      outcome:
        undefined,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.live_turn.router_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Live-turn routing failed"
    );

    /*
     * Fail open.
     *
     * The caller's transcript will continue through
     * the existing normal conversation path instead
     * of being lost.
     */
    return normalConversation();
  }
}

//--------------------------------------------------
// Persist Assistant Response
//--------------------------------------------------

async function persistAssistantResponse(
  callId:
    string,

  response:
    string
): Promise<void> {
  await ConversationService.addMessage({
    callId,

    role:
      "ASSISTANT",

    content:
      response,
  });

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,

      role:
        "ASSISTANT",

      text:
        response,

      timestamp:
        Date.now(),
    }
  );
}

//--------------------------------------------------
// Persist User Message
//--------------------------------------------------

async function persistUserMessage(
  callId:
    string,

  content:
    string
): Promise<void> {
  await ConversationService.addMessage({
    callId,

    role:
      "USER",

    content,
  });

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,

      role:
        "USER",

      text:
        content,

      timestamp:
        Date.now(),
    }
  );
}

//--------------------------------------------------
// Return To Listening
//--------------------------------------------------

function returnToListening(
  callId:
    string
): void {
  const currentState =
    ConversationStateService
      .getState(
        callId
      );

  if (
    currentState ===
      "ENDED" ||
    currentState ===
      "INTERRUPTING" ||
    currentState ===
      "INTERRUPTED"
  ) {
    return;
  }

  if (
    !AudioSessionService
      .getByCallId(
        callId
      )
  ) {
    return;
  }

  ConversationStateService.setState(
    callId,
    "LISTENING"
  );

  ConversationEvents.emit(
    "listening",
    callId
  );
}

//--------------------------------------------------
// Normal Conversation
//--------------------------------------------------

function normalConversation():
  LiveTurnRouteResult {
  return {
    handled:
      false,

    response:
      null,

    reason:
      "NORMAL_CONVERSATION",

    audioQueued:
      false,
  };
}
