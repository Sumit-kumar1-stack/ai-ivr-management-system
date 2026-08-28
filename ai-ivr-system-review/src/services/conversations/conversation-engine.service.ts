import {
  performance,
} from "node:perf_hooks";

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
  getCall,
  updateCall,
} from "@/services/calls/call.service";

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
  SpeechProduction,
} from "@/services/voice-runtime/speech-production.service";

import {
  resolveOutboundConversationContext,
} from "@/services/campaigns/outbound-conversation-context.service";

import {
  VoiceResponsePolicy,
} from "./voice-response-policy.service";

import {
  routeLocalIntent,
} from "./local-intent-router.service";

import {
  routeVoiceThroughIVR,
} from "@/services/ivr/ivr-hybrid-router.service";

import type {
  IVRActionExecutionResult,
} from "@/services/ivr/ivr-action-executor.service";

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

function throwIfTurnAborted(
  signal?: AbortSignal
): void {
  if (
    signal?.aborted
  ) {
    throw new DOMException(
      "Conversation turn aborted",
      "AbortError"
    );
  }
}

function isTurnAbortError(
  error: unknown,
  signal?: AbortSignal
): boolean {
  return (
    signal?.aborted === true ||
    (
      error instanceof Error &&
      error.name === "AbortError"
    )
  );
}

const DEFAULT_EARLY_SPEECH_MAX_WORDS =
  24;

const configuredEarlySpeechMaxWords =
  Number(
    process.env
      .VOICE_EARLY_SPEECH_MAX_WORDS
  );

const EARLY_SPEECH_MAX_WORDS =
  Number.isInteger(
    configuredEarlySpeechMaxWords
  ) &&
  configuredEarlySpeechMaxWords >= 5 &&
  configuredEarlySpeechMaxWords <= 40
    ? configuredEarlySpeechMaxWords
    : DEFAULT_EARLY_SPEECH_MAX_WORDS;

function countWords(
  text: string
): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function getRemainingSpeech(
  finalReply: string,
  earlySentence: string | null
): string {
  if (
    !earlySentence
  ) {
    return finalReply;
  }

  const normalizedReply =
    finalReply
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const normalizedEarlySentence =
    earlySentence
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (
    normalizedReply.startsWith(
      normalizedEarlySentence
    )
  ) {
    return normalizedReply
      .slice(
        normalizedEarlySentence.length
      )
      .trim();
  }

  return normalizedReply;
}

//--------------------------------------------------
// Handle Non-AI IVR Voice Action
//--------------------------------------------------

async function handleVoiceIVRExecution(
  callId: string,
  execution: IVRActionExecutionResult,
  signal?: AbortSignal,
  turnId?: number
): Promise<
  string | null
> {
  throwIfTurnAborted(
    signal
  );

  //------------------------------------------------
  // AI-Assisted Category
  //------------------------------------------------

  if (
    execution.requiresAI
  ) {
    /*
     * Continue through the normal RAG/LLM pipeline
     * using the caller's original utterance.
     */
    return null;
  }

  const reply =
    execution.message.trim();

  //------------------------------------------------
  // Nothing To Say
  //------------------------------------------------

  if (
    !reply
  ) {
    return "";
  }

  //------------------------------------------------
  // Speak Deterministic Action Result
  //------------------------------------------------

  void VoiceWorker.start(
    callId
  );

  const queued =
    await VoiceWorker.addText(
      callId,
      reply,
      turnId
    );

  throwIfTurnAborted(
    signal
  );

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

  if (
    !queued
  ) {
    returnToListening(
      callId
    );
  }

  return reply;
}

export async function startConversation(
  callId: string
): Promise<boolean> {
  const log =
    createCallLogger(
      callId
    );

  //----------------------------------------------
  // Resolve Call Opening Context
  //----------------------------------------------

  const outboundContext =
    await resolveOutboundConversationContext(
      callId
    );

  //----------------------------------------------
  // Opening Message
  //----------------------------------------------

  const greeting =
    outboundContext.outbound &&
    outboundContext.openingMessage
      ? outboundContext.openingMessage
      : "Hello. How may I help you today?";

  //----------------------------------------------
  // Log Greeting Source
  //----------------------------------------------

  log.info(
    {
      event:
        "conversation.greeting.resolved",

      outbound:
        outboundContext.outbound,

      campaignId:
        outboundContext.campaignId,

      campaignName:
        outboundContext.campaignName,

      workflowPurpose:
        outboundContext.purpose,

      greetingCharacterCount:
        greeting.length,
    },
    outboundContext.outbound
      ? "Outbound campaign greeting resolved"
      : "Default conversation greeting resolved"
  );

  await ConversationService.addMessage({
    callId,
    role:
      "ASSISTANT",
    content:
      greeting,
  });

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

  void VoiceWorker.start(
    callId
  );

  ConversationStateService.setState(
    callId,
    "THINKING"
  );

  const greetingQueued =
    await VoiceWorker.addText(
      callId,
      greeting
    );

  if (
    !greetingQueued
  ) {
    log.warn(
      {
        event:
          "conversation.greeting.tts_failed",
        greetingCharacterCount:
          greeting.length,
      },
      "Greeting TTS failed; returning to LISTENING"
    );

    returnToListening(
      callId
    );

    return false;
  }

  log.info(
    {
      event:
        "conversation.greeting.queued",
      greetingCharacterCount:
        greeting.length,
    },
    "Conversation greeting queued"
  );

  return true;
}

export async function processUserMessage(
  callId: string,
  message: string,
  signal?: AbortSignal,
  turnId?: number
): Promise<string> {
  const log =
    createCallLogger(
      callId
    );

  const turnStartedAt =
    performance.now();

  const normalizedMessage =
    message.trim();

  if (
    !normalizedMessage
  ) {
    log.warn(
      {
        event:
          "conversation.message.ignored",
        reason:
          "empty_message",
      },
      "Empty user message ignored"
    );

    return "";
  }

  log.info(
    {
      event:
        "conversation.processing.started",
      messageCharacterCount:
        normalizedMessage.length,
    },
    "Conversation processing started"
  );

  SilenceDetector.stop(
    callId
  );

  sentenceBuffer.clear(
    callId
  );

  throwIfTurnAborted(
    signal
  );

  try {
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

    ConversationStateService.setState(
      callId,
      "THINKING"
    );

    ConversationEvents.emit(
      "thinking",
      callId
    );

    throwIfTurnAborted(
      signal
    );

    const localIntentStartedAt =
      performance.now();

    const localIntent =
      routeLocalIntent(
        normalizedMessage
      );

    const localIntentRoutingMs =
      Math.round(
        performance.now() -
          localIntentStartedAt
      );

    log.info(
      {
        event:
          "conversation.intent.routed",
        intent:
          localIntent.type,
        handledLocally:
          localIntent.handled,
        durationMs:
          localIntentRoutingMs,
      },
      "Conversation intent routed"
    );

    if (
      localIntent.handled &&
      localIntent.reply
    ) {
      throwIfTurnAborted(
        signal
      );

      const reply =
        localIntent.reply;

      void VoiceWorker.start(
        callId
      );

      const localTtsStartedAt =
        performance.now();

      const audioQueued =
        await VoiceWorker.addText(
          callId,
          reply,
          turnId
        );

      const localTtsQueueMs =
        Math.round(
          performance.now() -
            localTtsStartedAt
        );

      throwIfTurnAborted(
        signal
      );

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

      log.info(
        {
          event:
            "conversation.intent.local_completed",
          intent:
            localIntent.type,
          replyCharacterCount:
            reply.length,
          audioQueued,
        },
        "Local conversation intent completed without RAG or Gemini"
      );

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
            "conversation.turn.latency",
          turnId:
            turnId ?? null,
          route:
            "LOCAL",
          intent:
            localIntent.type,
          intentRoutingMs:
            localIntentRoutingMs,
          ttsQueueMs:
            localTtsQueueMs,
          totalTurnMs:
            Math.round(
              performance.now() -
                turnStartedAt
            ),
          responseWordCount:
            reply
              .split(/\s+/)
              .filter(Boolean)
              .length,
          audioQueued,
        },
        "Local conversation turn latency measured"
      );

      return reply;
    }

    //----------------------------------------
    // Published IVR Voice Routing
    //----------------------------------------

    throwIfTurnAborted(
      signal
    );

    const hybridRoutingStartedAt =
      performance.now();

    const hybridRoute =
      await routeVoiceThroughIVR(
        callId,
        normalizedMessage
      );

    throwIfTurnAborted(
      signal
    );

    const hybridRoutingMs =
      Math.round(
        performance.now() -
          hybridRoutingStartedAt
      );

    log.info(
      {
        event:
          "conversation.ivr_voice.routed",

        matched:
          hybridRoute.matched,

        action:
          hybridRoute.action,

        confidence:
          hybridRoute.confidence,

        continueConversation:
          hybridRoute.continueConversation,

        durationMs:
          hybridRoutingMs,
      },
      "Conversation checked against published IVR voice actions"
    );

    //----------------------------------------
    // Deterministic IVR Action
    //----------------------------------------

    if (
      hybridRoute.matched &&
      hybridRoute.execution &&
      !hybridRoute.continueConversation
    ) {
      const handledReply =
        await handleVoiceIVRExecution(
          callId,
          hybridRoute.execution,
          signal,
          turnId
        );

      if (
        handledReply !==
        null
      ) {
        log.info(
          {
            event:
              "conversation.ivr_voice.completed",

            action:
              hybridRoute.action,

            confidence:
              hybridRoute.confidence,

            totalTurnMs:
              Math.round(
                performance.now() -
                  turnStartedAt
              ),
          },
          "Voice IVR semantic action completed without RAG or Gemini"
        );

        return handledReply;
      }
    }

    //----------------------------------------
    // AI-Assisted IVR Category
    //----------------------------------------

    if (
      hybridRoute.matched &&
      hybridRoute.execution?.requiresAI
    ) {
      log.info(
        {
          event:
            "conversation.ivr_voice.ai_continuation",

          action:
            hybridRoute.action,

          confidence:
            hybridRoute.confidence,
        },
        "Voice IVR category selected; continuing into conversational AI"
      );
    }

    //----------------------------------------
    // Build RAG Prompt
    //----------------------------------------

    throwIfTurnAborted(
      signal
    );

    const promptBuildStartedAt =
      performance.now();

    const basePrompt =
      await buildPrompt(
        callId,
        normalizedMessage
      );

    throwIfTurnAborted(
      signal
    );

    const promptBuildMs =
      Math.round(
        performance.now() -
          promptBuildStartedAt
      );

    const noRelevantKnowledge =
      basePrompt ===
      "NO_RELEVANT_KNOWLEDGE";

    const prompt =
      noRelevantKnowledge
        ? basePrompt
        : `${basePrompt}

${VoiceResponsePolicy.getInstruction()}`;

    log.info(
      {
        event:
          "conversation.prompt.ready",
        promptBuildMs,
        promptCharacterCount:
          prompt.length,
        voiceResponseMaxWords:
          VoiceResponsePolicy.maxWords,
        voiceResponseMaxSentences:
          VoiceResponsePolicy.maxSentences,
      },
      "Conversation prompt prepared"
    );

    throwIfTurnAborted(
      signal
    );

    log.info(
      {
        event:
          "conversation.prompt.generated",
        promptCharacterCount:
          prompt.length,
        noRelevantKnowledge,
      },
      "Conversation prompt generated"
    );

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

      throwIfTurnAborted(
        signal
      );

      void VoiceWorker.start(
        callId
      );

      const fallbackQueued =
        await VoiceWorker.addText(
          callId,
          reply,
          turnId
        );

      if (
        !fallbackQueued
      ) {
        log.warn(
          {
            event:
              "conversation.fallback.tts_failed",
            replyCharacterCount:
              reply.length,
          },
          "Fallback TTS failed; returning to LISTENING"
        );

        returnToListening(
          callId
        );
      }

      log.info(
        {
          event:
            "conversation.fallback.completed",
          replyCharacterCount:
            reply.length,
          audioQueued:
            fallbackQueued,
        },
        "Conversation fallback turn completed"
      );

      return reply;
    }

    void VoiceWorker.start(
      callId
    );

    throwIfTurnAborted(
      signal
    );

    SpeechProduction.begin(
      callId,
      turnId
    );

    const generationStartedAt =
      performance.now();

    let firstToken =
      true;

    let streamedChunkCount =
      0;

    let fullReply =
      "";

    let wasAborted =
      false;

    let earlySentence:
      string | null =
      null;

    let earlySpeechDecisionMade =
      false;

    let earlySpeechPromise:
      Promise<boolean> | null =
      null;

    let firstSpeechQueuedAt:
      number | null =
      null;

    const controller =
      ConversationAbort.create(
        callId
      );

    const abortFromTurn =
      (): void => {
        if (
          !controller.signal.aborted
        ) {
          controller.abort();
        }
      };

    if (
      signal
    ) {
      if (
        signal.aborted
      ) {
        abortFromTurn();
      } else {
        signal.addEventListener(
          "abort",
          abortFromTurn,
          {
            once:
              true,
          }
        );
      }
    }

    throwIfTurnAborted(
      signal
    );

    log.info(
      {
        event:
          "conversation.ai_stream.started",
        promptCharacterCount:
          prompt.length,
      },
      "Gemini streaming started"
    );

    try {
      for await (
        const chunk of
        generateAIResponseStream(
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
            {
              event:
                "conversation.ai_stream.interrupted",
              receivedChunkCount:
                streamedChunkCount,
              generatedCharacterCount:
                fullReply.length,
            },
            "Gemini stream interrupted by caller"
          );

          break;
        }

        if (
          !chunk
        ) {
          continue;
        }

        streamedChunkCount +=
          1;

        if (
          firstToken
        ) {
          firstToken =
            false;

          log.info(
            {
              event:
                "conversation.ai_stream.first_token",
              latencyMs:
                Math.round(
                  performance.now() -
                    generationStartedAt
                ),
            },
            "First Gemini token received"
          );
        }

        fullReply +=
          chunk;

        sentenceBuffer.append(
          callId,
          chunk
        );

        await sentenceBuffer
          .flushCompleteSentences(
            callId,
            async sentence => {
              if (
                earlySpeechDecisionMade
              ) {
                return;
              }

              earlySpeechDecisionMade =
                true;

              if (
                controller.signal.aborted ||
                signal?.aborted
              ) {
                return;
              }

              const sentenceWordCount =
                countWords(
                  sentence
                );

              if (
                sentenceWordCount >
                EARLY_SPEECH_MAX_WORDS
              ) {
                log.debug(
                  {
                    event:
                      "conversation.early_speech.skipped",
                    reason:
                      "first_sentence_too_long",
                    sentenceWordCount,
                    maximumWordCount:
                      EARLY_SPEECH_MAX_WORDS,
                  },
                  "Early speech skipped because first sentence is too long"
                );

                return;
              }

              earlySentence =
                sentence;

              const earlySpeechStartedAt =
                performance.now();

              log.info(
                {
                  event:
                    "conversation.early_speech.started",
                  turnId:
                    turnId ?? null,
                  sentenceCharacterCount:
                    sentence.length,
                  sentenceWordCount,
                  generationElapsedMs:
                    Math.round(
                      earlySpeechStartedAt -
                        generationStartedAt
                    ),
                },
                "Early first-sentence speech synthesis started"
              );

              earlySpeechPromise =
                VoiceWorker.addText(
                  callId,
                  sentence,
                  turnId
                )
                  .then(
                    queued => {
                      if (
                        queued
                      ) {
                        firstSpeechQueuedAt =
                          performance.now();
                      }

                      log.info(
                        {
                          event:
                            "conversation.early_speech.completed",
                          turnId:
                            turnId ?? null,
                          audioQueued:
                            queued,
                          sentenceCharacterCount:
                            sentence.length,
                          generationToSpeechQueueMs:
                            firstSpeechQueuedAt
                              ? Math.round(
                                  firstSpeechQueuedAt -
                                    generationStartedAt
                                )
                              : null,
                        },
                        queued
                          ? "Early first-sentence speech queued"
                          : "Early first-sentence speech was not queued"
                      );

                      return queued;
                    }
                  )
                  .catch(
                    error => {
                      log.error(
                        {
                          event:
                            "conversation.early_speech.failed",
                          turnId:
                            turnId ?? null,
                          error:
                            normalizeError(
                              error
                            ),
                        },
                        "Early first-sentence speech failed"
                      );

                      return false;
                    }
                  );
            }
          );
      }

      await sentenceBuffer
        .flushRemaining(
          callId,
          async () => {
            // Remaining text is synthesized below
            // after the final response policy.
          }
        );
    } catch (
      error
    ) {
      if (
        isTurnAbortError(
          error,
          signal
        ) ||
        controller.signal.aborted
      ) {
        wasAborted =
          true;

        log.info(
          {
            event:
              "conversation.ai_stream.aborted",
            receivedChunkCount:
              streamedChunkCount,
            generatedCharacterCount:
              fullReply.length,
          },
          "Gemini stream aborted"
        );
      } else {
        log.error(
          {
            event:
              "conversation.ai_stream.failed",
            receivedChunkCount:
              streamedChunkCount,
            generatedCharacterCount:
              fullReply.length,
            error:
              normalizeError(
                error
              ),
          },
          "Gemini streaming failed"
        );

        throw error;
      }
    } finally {
      signal?.removeEventListener(
        "abort",
        abortFromTurn
      );

      ConversationAbort.clear(
        callId
      );
    }

    if (
      wasAborted ||
      controller.signal.aborted
    ) {
      SpeechProduction.complete(
        callId,
        turnId
      );

      sentenceBuffer.clear(
        callId
      );

      log.info(
        {
          event:
            "conversation.ai_response.discarded",
          generatedCharacterCount:
            fullReply.length,
          receivedChunkCount:
            streamedChunkCount,
        },
        "Interrupted AI response discarded"
      );

      if (
        signal?.aborted
      ) {
        throw new DOMException(
          "Conversation turn aborted",
          "AbortError"
        );
      }

      returnToListening(
        callId
      );

      return "";
    }

    const totalGenerationMs =
      Math.round(
        performance.now() -
          generationStartedAt
      );

    log.info(
      {
        event:
          "conversation.ai_stream.completed",
        replyCharacterCount:
          fullReply.length,
        receivedChunkCount:
          streamedChunkCount,
        totalGenerationMs,
      },
      "Gemini stream finished"
    );

    const rawFinalReply =
      fullReply.trim();

    const finalReply =
      VoiceResponsePolicy.apply(
        rawFinalReply
      );

    if (
      finalReply !==
      rawFinalReply
    ) {
      log.info(
        {
          event:
            "conversation.response.shortened",
          originalCharacterCount:
            rawFinalReply.length,
          finalCharacterCount:
            finalReply.length,
          originalWordCount:
            rawFinalReply
              .split(/\s+/)
              .filter(Boolean)
              .length,
          finalWordCount:
            finalReply
              .split(/\s+/)
              .filter(Boolean)
              .length,
        },
        "Voice response policy shortened AI response"
      );
    }

    if (
      !finalReply
    ) {
      SpeechProduction.complete(
        callId,
        turnId
      );

      log.warn(
        {
          event:
            "conversation.ai_response.empty",
          receivedChunkCount:
            streamedChunkCount,
          totalGenerationMs,
        },
        "Gemini returned an empty response"
      );

      returnToListening(
        callId
      );

      return "";
    }

    throwIfTurnAborted(
      signal
    );

    const ttsStartedAt =
      performance.now();

    let earlyAudioQueued =
      false;

    if (
      earlySpeechPromise
    ) {
      earlyAudioQueued =
        await earlySpeechPromise;

      throwIfTurnAborted(
        signal
      );
    }

    const remainingSpeech =
      earlyAudioQueued
        ? getRemainingSpeech(
            finalReply,
            earlySentence
          )
        : finalReply;

    let remainingAudioQueued =
      false;

    if (
      remainingSpeech.trim()
    ) {
      remainingAudioQueued =
        await VoiceWorker.addText(
          callId,
          remainingSpeech,
          turnId
        );

      throwIfTurnAborted(
        signal
      );
    }

    const audioQueued =
      earlyAudioQueued ||
      remainingAudioQueued;

    SpeechProduction.complete(
      callId,
      turnId
    );

    const ttsQueueMs =
      Math.round(
        performance.now() -
          ttsStartedAt
      );

    log.info(
      {
        event:
          "conversation.streaming_tts.completed",
        turnId:
          turnId ?? null,
        earlySpeechUsed:
          Boolean(
            earlySentence
          ),
        earlyAudioQueued,
        remainingAudioQueued,
        earlySentenceCharacterCount:
          String(
            earlySentence ??
              ""
          ).length,
        remainingSpeechCharacterCount:
          remainingSpeech.length,
        totalResponseCharacterCount:
          finalReply.length,
        firstSpeechQueueLatencyMs:
          firstSpeechQueuedAt
            ? Math.round(
                firstSpeechQueuedAt -
                  generationStartedAt
              )
            : null,
      },
      "Streaming conversation speech queueing completed"
    );

    throwIfTurnAborted(
      signal
    );

    const totalTurnMs =
      Math.round(
        performance.now() -
          turnStartedAt
      );

    log.info(
      {
        event:
          "conversation.turn.latency",
        turnId:
          turnId ?? null,
        route:
          "AI",
        promptBuildMs,
        generationMs:
          totalGenerationMs,
        ttsQueueMs,
        totalTurnMs,
        earlySpeechUsed:
          earlyAudioQueued,
        firstSpeechQueueMs:
          firstSpeechQueuedAt
            ? Math.round(
                firstSpeechQueuedAt -
                  generationStartedAt
              )
            : null,
        remainingSpeechCharacterCount:
          remainingSpeech.length,
        responseCharacterCount:
          finalReply.length,
        responseWordCount:
          finalReply
            .split(/\s+/)
            .filter(Boolean)
            .length,
        audioQueued,
      },
      "Conversation turn latency measured"
    );

    if (
      !audioQueued
    ) {
      log.warn(
        {
          event:
            "conversation.tts.queue_failed",
          replyCharacterCount:
            finalReply.length,
        },
        "TTS failed or no audio was queued; returning to LISTENING"
      );

      returnToListening(
        callId
      );
    }

    await ConversationService.addMessage({
      callId,
      role:
        "ASSISTANT",
      content:
        finalReply,
    });

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

    const conversation =
      await ConversationService
        .getConversation(
          callId
        );

    if (
      !conversation
    ) {
      log.warn(
        {
          event:
            "conversation.context.not_found",
          replyCharacterCount:
            finalReply.length,
        },
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
          item =>
            `${item.role}: ${item.content}`
        )
        .join(
          "\n"
        );

    log.debug(
      {
        event:
          "conversation.transcript.built",
        messageCount:
          conversation.messages.length,
        transcriptCharacterCount:
          transcript.length,
      },
      "Conversation transcript built"
    );

    if (
      conversation.messages.length > 0 &&
      conversation.messages.length % 5 === 0
    ) {
      try {
        throwIfTurnAborted(
          signal
        );

        log.info(
          {
            event:
              "conversation.memory.update_started",
            messageCount:
              conversation.messages.length,
            transcriptCharacterCount:
              transcript.length,
          },
          "Updating conversation memory"
        );

        const summary =
          await generateConversationSummary(
            transcript
          );

        throwIfTurnAborted(
          signal
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
          {
            event:
              "conversation.memory.updated",
            summaryCharacterCount:
              summary.length,
          },
          "Conversation memory updated"
        );
      } catch (
        error
      ) {
        if (
          isTurnAbortError(
            error,
            signal
          )
        ) {
          throw error;
        }

        log.error(
          {
            event:
              "conversation.memory.update_failed",
            messageCount:
              conversation.messages.length,
            error:
              normalizeError(
                error
              ),
          },
          "Conversation memory update failed"
        );
      }
    }

    const enablePostTurn =
      process.env
        .ENABLE_POST_TURN_ANALYSIS !==
      "false";

    if (
      enablePostTurn
    ) {
      try {
        throwIfTurnAborted(
          signal
        );

        log.info(
          {
            event:
              "conversation.analysis.started",
            transcriptCharacterCount:
              transcript.length,
          },
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
          {
            event:
              "conversation.analysis.saved",
          },
          "Conversation analysis saved"
        );
      } catch (
        error
      ) {
        if (
          isTurnAbortError(
            error,
            signal
          )
        ) {
          throw error;
        }

        log.error(
          {
            event:
              "conversation.analysis.failed",
            error:
              normalizeError(
                error
              ),
          },
          "Conversation analysis failed"
        );
      }

      try {
        throwIfTurnAborted(
          signal
        );

        log.info(
          {
            event:
              "conversation.action_detection.started",
            transcriptCharacterCount:
              transcript.length,
          },
          "Detecting conversation actions"
        );

        const action =
          await detectAction(
            transcript
          );

        throwIfTurnAborted(
          signal
        );

        if (
          action.action !==
          "NONE"
        ) {
          log.info(
            {
              event:
                "conversation.action.detected",
              action:
                action.action,
              reasonPresent:
                Boolean(
                  action.reason
                ),
              reasonCharacterCount:
                String(
                  action.reason ??
                    ""
                ).length,
            },
            "Conversation action detected"
          );

          await executeAction(
            action.action,
            callId
          );
        } else {
          log.info(
            {
              event:
                "conversation.action.none",
            },
            "No conversation action required"
          );
        }
      } catch (
        error
      ) {
        if (
          isTurnAbortError(
            error,
            signal
          )
        ) {
          throw error;
        }

        log.error(
          {
            event:
              "conversation.action_detection.failed",
            error:
              normalizeError(
                error
              ),
          },
          "Action detection failed"
        );
      }
    }

    throwIfTurnAborted(
      signal
    );

    log.info(
      {
        event:
          "conversation.turn.completed",
        replyCharacterCount:
          finalReply.length,
        messageCount:
          conversation.messages.length,
        audioQueued,
        totalGenerationMs,
      },
      "Conversation turn completed"
    );

    sentenceBuffer.clear(
      callId
    );

    return finalReply;
  } catch (
    error
  ) {
    SpeechProduction.complete(
      callId,
      turnId
    );

    const aborted =
      isTurnAbortError(
        error,
        signal
      );

    if (
      aborted
    ) {
      log.info(
        {
          event:
            "conversation.processing.cancelled",
          messageCharacterCount:
            normalizedMessage.length,
          signalAborted:
            signal?.aborted ??
            false,
        },
        "Conversation turn cancelled"
      );

      throw error;
    }

    log.error(
      {
        event:
          "conversation.processing.failed",
        messageCharacterCount:
          normalizedMessage.length,
        error:
          normalizeError(
            error
          ),
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

export async function runPostCallProcessing(
  callId: string
): Promise<void> {
  const log =
    createCallLogger(
      callId
    );

  const processingStartedAt =
    performance.now();

  log.info(
    {
      event:
        "conversation.post_call.started",
    },
    "Running post-call processing"
  );

  const call =
    await getCall(
      callId
    );

  if (
    !call
  ) {
    log.warn(
      {
        event:
          "conversation.post_call.skipped",
        reason:
          "call_not_found",
      },
      "Call not found for post-call processing"
    );

    return;
  }

  if (
    call.transcript &&
    call.summary
  ) {
    log.info(
      {
        event:
          "conversation.post_call.skipped",
        reason:
          "already_completed",
        transcriptPresent:
          true,
        summaryPresent:
          true,
      },
      "Post-call processing already completed; skipping"
    );

    return;
  }

  const conversation =
    await getCompleteConversation(
      callId
    );

  if (
    !conversation
  ) {
    log.warn(
      {
        event:
          "conversation.post_call.skipped",
        reason:
          "conversation_not_found",
      },
      "Conversation not found for post-call processing"
    );

    return;
  }

  if (
    conversation.messages.length === 0
  ) {
    log.warn(
      {
        event:
          "conversation.post_call.skipped",
        reason:
          "no_messages",
      },
      "Conversation contains no messages; post-call processing skipped"
    );

    return;
  }

  const transcript =
    conversation.messages
      .map(
        message =>
          `${message.role}: ${message.content}`
      )
      .join(
        "\n"
      );

  log.info(
    {
      event:
        "conversation.post_call.transcript_built",
      messageCount:
        conversation.messages.length,
      transcriptCharacterCount:
        transcript.length,
    },
    "Complete call transcript built"
  );

  await updateCall(
    callId,
    {
      transcript,
    }
  );

  log.info(
    {
      event:
        "conversation.post_call.transcript_saved",
      transcriptCharacterCount:
        transcript.length,
    },
    "Complete call transcript saved"
  );

  let analysis:
    Awaited<
      ReturnType<
        typeof generateConversationAnalysis
      >
    >;

  try {
    log.info(
      {
        event:
          "conversation.post_call.analysis_started",
        transcriptCharacterCount:
          transcript.length,
      },
      "Generating post-call conversation analysis"
    );

    analysis =
      await generateConversationAnalysis(
        transcript
      );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.post_call.analysis_failed",
        transcriptCharacterCount:
          transcript.length,
        error:
          normalizeError(
            error
          ),
      },
      "Post-call analysis generation failed"
    );

    return;
  }

  await saveConversationAnalysis(
    conversation.id,
    analysis
  );

  await updateCall(
    callId,
    {
      transcript,
      summary:
        analysis.summary,
    }
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

  const enablePostCallActions =
    process.env
      .ENABLE_POST_CALL_ACTIONS ===
    "true";

  if (
    enablePostCallActions
  ) {
    try {
      log.info(
        {
          event:
            "conversation.post_call_action.detection_started",
          transcriptCharacterCount:
            transcript.length,
        },
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
            event:
              "conversation.post_call_action.detected",
            action:
              action.action,
            reasonPresent:
              Boolean(
                action.reason
              ),
            reasonCharacterCount:
              String(
                action.reason ??
                  ""
              ).length,
          },
          "Post-call action detected"
        );

        await executeAction(
          action.action,
          callId
        );
      } else {
        log.info(
          {
            event:
              "conversation.post_call_action.none",
          },
          "No post-call action required"
        );
      }
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "conversation.post_call_action.failed",
          error:
            normalizeError(
              error
            ),
        },
        "Post-call action detection failed"
      );
    }
  }

  log.info(
    {
      event:
        "conversation.post_call.completed",
      messageCount:
        conversation.messages.length,
      transcriptCharacterCount:
        transcript.length,
      summaryCharacterCount:
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
      durationMs:
        Math.round(
          performance.now() -
            processingStartedAt
        ),
    },
    "Post-call processing completed successfully"
  );
}