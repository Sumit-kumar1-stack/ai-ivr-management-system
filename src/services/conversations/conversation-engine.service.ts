import {
  performance,
} from "node:perf_hooks";

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  getCall,
  updateCall,
} from "@/services/calls/call.service";

import {
  RealtimeService,
} from "@/services/realtime/realtime.service";

import {
  sentenceBuffer,
} from "@/services/voice/sentence-buffer.service";

import {
  voiceQueue,
} from "@/services/voice/voice-queue.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  detectAction,
} from "./action-detector.service";

import {
  executeAction,
} from "./action.service";

import {
  generateConversationAnalysis,
} from "./analysis.service";

import {
  generateAIResponseStream,
} from "./ai-response.service";

import {
  ConversationAbort,
} from "./abort.service";

import {
  ConversationEvents,
} from "./conversation-events.service";

import {
  ConversationService,
  getCompleteConversation,
  saveConversationAnalysis,
} from "./conversation.service";

import {
  ConversationStateService,
} from "./conversation-state.service";

import {
  updateConversationMemory,
} from "./memory.service";

import {
  buildPrompt,
} from "./prompt-builder.service";

import {
  SilenceDetector,
} from "./silence-detector.service";

import {
  generateConversationSummary,
} from "./summary.service";

/**
 * Return an active call to LISTENING when
 * no generated audio is going to be played.
 */
function returnToListening(
  callId: string
): void {
  const state =
    ConversationStateService.getState(
      callId
    );

  if (
    state === "ENDED" ||
    state === "INTERRUPTING" ||
    state === "INTERRUPTED"
  ) {
    return;
  }

  if (
    !AudioSessionService.getByCallId(
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

/**
 * Initializes a conversation and optionally
 * queues the initial spoken greeting.
 */
export async function startConversation(
  callId: string
): Promise<boolean> {
  const log =
    createCallLogger(
      callId
    );

  const greeting =
    "Hello. Welcome to ABC Company. How may I help you today?";

  //----------------------------------------
  // Persist greeting
  //----------------------------------------

  await ConversationService.addMessage({
    callId,

    role:
      "ASSISTANT",

    content:
      greeting,
  });

  //----------------------------------------
  // Publish greeting
  //----------------------------------------

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,

      role:
        "ASSISTANT",

      text:
        greeting,

      timestamp:
        Date.now(),
    }
  );

  RealtimeService.assistant(
    callId,
    greeting
  );

  //----------------------------------------
  // Start playback worker
  //----------------------------------------

  void VoiceWorker.start(
    callId
  );

  //----------------------------------------
  // Generate greeting audio
  //----------------------------------------

  ConversationStateService.setState(
    callId,
    "THINKING"
  );

  const greetingQueued =
    await VoiceWorker.addText(
      callId,
      greeting
    );

  if (!greetingQueued) {
    log.warn(
      {
        callId,
      },
      "Greeting TTS failed; returning to LISTENING"
    );

    returnToListening(
      callId
    );
  }

  return true;
}

/**
 * Processes one final caller transcript.
 */
export async function processUserMessage(
  callId: string,
  message: string
): Promise<string> {
  const log =
    createCallLogger(
      callId
    );

  const normalizedMessage =
    message.trim();

  if (!normalizedMessage) {
    log.warn(
      "Empty user message ignored"
    );

    return "";
  }

  log.info(
    {
      transcript:
        normalizedMessage,
    },
    "Conversation processing started"
  );

  SilenceDetector.stop(
    callId
  );

  sentenceBuffer.clear(
    callId
  );

  try {
    //----------------------------------------
    // Persist user message
    //----------------------------------------

    await ConversationService.addMessage({
      callId,

      role:
        "USER",

      content:
        normalizedMessage,
    });

    await EventPublisher.publish(
      AppEvent.CONVERSATION_MESSAGE,
      {
        callId,

        role:
          "USER",

        text:
          normalizedMessage,

        timestamp:
          Date.now(),
      }
    );

    //----------------------------------------
    // Thinking state
    //----------------------------------------

    ConversationStateService.setState(
      callId,
      "THINKING"
    );

    ConversationEvents.emit(
      "thinking",
      callId
    );

    //----------------------------------------
    // Build RAG prompt
    //----------------------------------------

    const prompt =
      await buildPrompt(
        callId,
        normalizedMessage
      );

    log.info(
      {
        promptLength:
          prompt.length,
      },
      "Prompt generated"
    );

    //----------------------------------------
    // No relevant knowledge fallback
    //----------------------------------------

    if (
      prompt ===
      "NO_RELEVANT_KNOWLEDGE"
    ) {
      const reply =
        "I couldn't find that information in our knowledge base.";

      await ConversationService.addMessage({
        callId,

        role:
          "ASSISTANT",

        content:
          reply,
      });

      await EventPublisher.publish(
        AppEvent.CONVERSATION_MESSAGE,
        {
          callId,

          role:
            "ASSISTANT",

          text:
            reply,

          timestamp:
            Date.now(),
        }
      );

      RealtimeService.assistant(
        callId,
        reply
      );

      void VoiceWorker.start(
        callId
      );

      const fallbackQueued =
        await VoiceWorker.addText(
          callId,
          reply
        );

      if (!fallbackQueued) {
        log.warn(
          {
            callId,
          },
          "Fallback TTS failed; returning to LISTENING"
        );

        returnToListening(
          callId
        );
      }

      log.info(
        {
          replyLength:
            reply.length,

          audioQueued:
            fallbackQueued,
        },
        "Conversation fallback turn completed"
      );

      RealtimeService.completed(
        callId
      );

      return reply;
    }

    //----------------------------------------
    // Start playback worker
    //----------------------------------------

    void VoiceWorker.start(
      callId
    );

    //----------------------------------------
    // Stream Gemini text
    //----------------------------------------

    const generationStartedAt =
      performance.now();

    let firstToken =
      true;

    let fullReply =
      "";

    let wasAborted =
      false;

    const controller =
      ConversationAbort.create(
        callId
      );

    log.info(
      "Gemini streaming started"
    );

    try {
      for await (
        const chunk of generateAIResponseStream(
          prompt,
          controller.signal
        )
      ) {
        if (
          controller.signal.aborted
        ) {
          wasAborted =
            true;

          log.info(
            "Gemini stream interrupted by caller"
          );

          break;
        }

        if (!chunk) {
          continue;
        }

        if (firstToken) {
          firstToken =
            false;

          log.info(
            {
              latencyMs:
                Number(
                  (
                    performance.now() -
                    generationStartedAt
                  ).toFixed(
                    0
                  )
                ),
            },
            "First Gemini token received"
          );
        }

        process.stdout.write(
          chunk
        );

        /*
         * Collect the complete response.
         *
         * Do not generate TTS for each streamed
         * sentence because it can duplicate final
         * sentence playback and consume extra quota.
         */
        fullReply +=
          chunk;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name ===
          "AbortError"
      ) {
        wasAborted =
          true;

        log.info(
          "Gemini stream aborted"
        );
      } else {
        log.error(
          {
            error,
          },
          "Gemini streaming failed"
        );

        throw error;
      }
    } finally {
      ConversationAbort.clear(
        callId
      );
    }

    //----------------------------------------
    // Interrupted response
    //----------------------------------------

    if (
      wasAborted ||
      controller.signal.aborted
    ) {
      sentenceBuffer.clear(
        callId
      );

      log.info(
        {
          generatedCharacters:
            fullReply.length,
        },
        "Interrupted AI response discarded"
      );

      returnToListening(
        callId
      );

      return "";
    }

    log.info(
      {
        replyLength:
          fullReply.length,

        totalGenerationMs:
          Number(
            (
              performance.now() -
              generationStartedAt
            ).toFixed(
              0
            )
          ),
      },
      "Gemini stream finished"
    );

    //----------------------------------------
    // Validate response
    //----------------------------------------

    const finalReply =
      fullReply.trim();

    if (!finalReply) {
      log.warn(
        "Gemini returned an empty response"
      );

      returnToListening(
        callId
      );

      return "";
    }

    //----------------------------------------
    // Generate exactly one TTS request
    //----------------------------------------

    const audioQueued =
      await VoiceWorker.addText(
        callId,
        finalReply
      );

    if (!audioQueued) {
      log.warn(
        {
          callId,
        },
        "TTS failed or no audio was queued; returning to LISTENING"
      );

      returnToListening(
        callId
      );
    }

    //----------------------------------------
    // Persist assistant reply
    //----------------------------------------

    await ConversationService.addMessage({
      callId,

      role:
        "ASSISTANT",

      content:
        finalReply,
    });

    RealtimeService.assistant(
      callId,
      finalReply
    );

    await EventPublisher.publish(
      AppEvent.CONVERSATION_MESSAGE,
      {
        callId,

        role:
          "ASSISTANT",

        text:
          finalReply,

        timestamp:
          Date.now(),
      }
    );

    //----------------------------------------
    // Load recent conversation context
    //----------------------------------------

    const conversation =
      await ConversationService
        .getConversation(
          callId
        );

    if (!conversation) {
      log.warn(
        "Conversation not found after AI response"
      );

      sentenceBuffer.clear(
        callId
      );

      return finalReply;
    }

    const transcript =
      conversation.messages
        .map(
          (item) =>
            `${item.role}: ${item.content}`
        )
        .join(
          "\n"
        );

    log.debug(
      {
        transcript,
      },
      "Conversation transcript built"
    );

    //----------------------------------------
    // Update live memory every five messages
    //----------------------------------------

    if (
      conversation.messages.length >
        0 &&
      conversation.messages.length %
        5 ===
        0
    ) {
      try {
        log.info(
          "Updating conversation memory"
        );

        const summary =
          await generateConversationSummary(
            transcript
          );

        await updateConversationMemory(
          callId,
          summary
        );

        await EventPublisher.publish(
          AppEvent.CONVERSATION_SUMMARY,
          {
            callId,

            summary,

            timestamp:
              Date.now(),
          }
        );

        log.info(
          "Conversation memory updated"
        );
      } catch (error) {
        log.error(
          {
            error,
          },
          "Conversation memory update failed"
        );
      }
    }

    //----------------------------------------
    // Optional per-turn analysis
    //----------------------------------------

    const enablePostTurn =
      process.env
        .ENABLE_POST_TURN_ANALYSIS !==
      "false";

    if (enablePostTurn) {
      try {
        log.info(
          "Generating conversation analysis"
        );

        const analysis =
          await generateConversationAnalysis(
            transcript
          );

        await saveConversationAnalysis(
          conversation.id,
          analysis
        );

        await EventPublisher.publish(
          AppEvent.CONVERSATION_ANALYSIS,
          {
            callId,

            analysis,

            timestamp:
              Date.now(),
          }
        );

        log.info(
          "Conversation analysis saved"
        );
      } catch (error) {
        log.error(
          {
            error,
          },
          "Conversation analysis failed"
        );
      }

      try {
        log.info(
          "Detecting conversation actions"
        );

        const action =
          await detectAction(
            transcript
          );

        if (
          action.action !==
          "NONE"
        ) {
          log.info(
            {
              action:
                action.action,

              reason:
                action.reason,
            },
            "Conversation action detected"
          );

          await executeAction(
            action.action,
            callId
          );
        } else {
          log.info(
            "No conversation action required"
          );
        }
      } catch (error) {
        log.error(
          {
            error,
          },
          "Action detection failed"
        );
      }
    }

    //----------------------------------------
    // Turn completed
    //----------------------------------------

    log.info(
      {
        replyLength:
          finalReply.length,

        audioQueued,
      },
      "Conversation turn completed"
    );

    RealtimeService.completed(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    return finalReply;
  } catch (error) {
    log.error(
      {
        error,
        callId,
      },
      "Conversation processing failed"
    );

    sentenceBuffer.clear(
      callId
    );

    voiceQueue.clear(
      callId
    );

    returnToListening(
      callId
    );

    throw error;
  }
}

/**
 * Runs durable post-call persistence and analysis.
 *
 * It:
 * - loads every conversation message;
 * - saves the full transcript to Call;
 * - generates one structured analysis;
 * - saves analysis to Conversation;
 * - saves the summary to Call;
 * - optionally performs a separate action request.
 */
export async function runPostCallProcessing(
  callId: string
): Promise<void> {
  const log =
    createCallLogger(
      callId
    );

  log.info(
    "Running post-call processing"
  );

  //----------------------------------------
  // Confirm call exists
  //----------------------------------------

  const call =
    await getCall(
      callId
    );

  if (!call) {
    log.warn(
      "Call not found for post-call processing"
    );

    return;
  }

  //----------------------------------------
  // Durable idempotency check
  //----------------------------------------

  if (
    call.transcript &&
    call.summary
  ) {
    log.info(
      {
        callId,
      },
      "Post-call processing already completed; skipping"
    );

    return;
  }

  //----------------------------------------
  // Load every conversation message
  //----------------------------------------

  const conversation =
    await getCompleteConversation(
      callId
    );

  if (!conversation) {
    log.warn(
      "Conversation not found for post-call processing"
    );

    return;
  }

  if (
    conversation.messages.length ===
    0
  ) {
    log.warn(
      "Conversation contains no messages; post-call processing skipped"
    );

    return;
  }

  //----------------------------------------
  // Build complete transcript
  //----------------------------------------

  const transcript =
    conversation.messages
      .map(
        (message) =>
          `${message.role}: ${message.content}`
      )
      .join(
        "\n"
      );

  log.info(
    {
      callId,

      messageCount:
        conversation.messages.length,

      transcriptLength:
        transcript.length,
    },
    "Complete call transcript built"
  );

  //----------------------------------------
  // Persist transcript before AI analysis
  //----------------------------------------

  await updateCall(
    callId,
    {
      transcript,
    }
  );

  //----------------------------------------
  // Generate one structured analysis
  //----------------------------------------

  let analysis:
    Awaited<
      ReturnType<
        typeof generateConversationAnalysis
      >
    >;

  try {
    log.info(
      "Generating post-call conversation analysis"
    );

    analysis =
      await generateConversationAnalysis(
        transcript
      );
  } catch (error) {
    log.error(
      {
        error,
      },
      "Post-call analysis generation failed"
    );

    /*
     * The transcript remains safely persisted.
     * The analysis may be retried later.
     */
    return;
  }

  //----------------------------------------
  // Persist conversation analysis
  //----------------------------------------

  await saveConversationAnalysis(
    conversation.id,
    analysis
  );

  //----------------------------------------
  // Persist call summary
  //----------------------------------------

  await updateCall(
    callId,
    {
      transcript,

      summary:
        analysis.summary,
    }
  );

  //----------------------------------------
  // Publish analysis event
  //----------------------------------------

  await EventPublisher.publish(
    AppEvent.CONVERSATION_ANALYSIS,
    {
      callId,

      analysis,

      timestamp:
        Date.now(),
    }
  );

  //----------------------------------------
  // Optional additional action request
  //----------------------------------------

  const enablePostCallActions =
    process.env
      .ENABLE_POST_CALL_ACTIONS ===
    "true";

  if (enablePostCallActions) {
    try {
      log.info(
        "Detecting post-call conversation action"
      );

      const action =
        await detectAction(
          transcript
        );

      if (
        action.action !==
        "NONE"
      ) {
        log.info(
          {
            action:
              action.action,

            reason:
              action.reason,
          },
          "Post-call action detected"
        );

        await executeAction(
          action.action,
          callId
        );
      } else {
        log.info(
          "No post-call action required"
        );
      }
    } catch (error) {
      log.error(
        {
          error,
        },
        "Post-call action detection failed"
      );
    }
  }

  log.info(
    {
      callId,

      transcriptLength:
        transcript.length,

      summaryLength:
        analysis.summary.length,

      intent:
        analysis.intent,

      sentiment:
        analysis.sentiment,

      priority:
        analysis.priority,

      followUp:
        analysis.followUp,

      actionItemCount:
        analysis.actionItems.length,
    },
    "Post-call processing completed successfully"
  );
}