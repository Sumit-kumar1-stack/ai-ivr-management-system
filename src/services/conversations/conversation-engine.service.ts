import { performance } from "perf_hooks";

import {
  ConversationService,
  saveConversationAnalysis,
} from "./conversation.service";

import {
  buildPrompt,
} from "./prompt-builder.service";

import {
  EventPublisher,
  AppEvent,
} from "@/core/events";

import {
  generateAIResponseStream,
} from "./ai-response.service";

import {
  generateConversationSummary,
} from "./summary.service";

import {
  generateConversationAnalysis,
} from "./analysis.service";

import {
  detectAction,
} from "./action-detector.service";

import {
  executeAction,
} from "./action.service";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  updateConversationMemory,
} from "./memory.service";

import {
  ConversationAbort,
} from "./abort.service";

import {
  ConversationStateService,
} from "./conversation-state.service";

import {
  ConversationEvents,
} from "./conversation-events.service";

import {
  SilenceDetector,
} from "./silence-detector.service";

import {
  RealtimeService,
} from "@/services/realtime/realtime.service";

import {
  sentenceBuffer,
} from "@/services/voice/sentence-buffer.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

/**
 * Initializes a new AI conversation.
 */
export async function startConversation(
  callId: string
): Promise<boolean> {

  const greeting =
    "Hello. Welcome to ABC Company. How may I help you today?";

  //----------------------------------------
  // Save Greeting
  //----------------------------------------

  await ConversationService.addMessage({
    callId,
    role: "ASSISTANT",
    content: greeting,
  });

  //----------------------------------------
  // Dashboard Event
  //----------------------------------------

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,
      role: "ASSISTANT",
      text: greeting,
      timestamp: Date.now(),
    }
  );

  RealtimeService.assistant(
    callId,
    greeting
  );

  //----------------------------------------
  // Start Voice Worker
  //----------------------------------------

  void VoiceWorker.start(callId);

  //----------------------------------------
  // Queue Greeting for Streaming Call
  //----------------------------------------

  await VoiceWorker.addText(
    callId,
    greeting
  );

  //----------------------------------------
  // Listening State
  //----------------------------------------

  ConversationStateService.setState(
    callId,
    "LISTENING"
  );

  ConversationEvents.emit(
    "listening",
    callId
  );

  return true;
}

/**
 * Processes one final user transcript.
 */
export async function processUserMessage(
  callId: string,
  message: string
): Promise<string> {

  const log =
    createCallLogger(callId);

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
      transcript: normalizedMessage,
    },
    "Conversation processing started"
  );

  //----------------------------------------
  // Stop Pending Silence Timer
  //----------------------------------------

  SilenceDetector.stop(callId);

  //----------------------------------------
  // Remove Old Sentence Data
  //----------------------------------------

  sentenceBuffer.clear(callId);

  //----------------------------------------
  // Save User Message
  //----------------------------------------

  await ConversationService.addMessage({
    callId,
    role: "USER",
    content: normalizedMessage,
  });

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,
      role: "USER",
      text: normalizedMessage,
      timestamp: Date.now(),
    }
  );

  //----------------------------------------
  // Thinking State
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
  // Build RAG Prompt
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
  // No Relevant Knowledge
  //----------------------------------------

  if (
    prompt ===
    "NO_RELEVANT_KNOWLEDGE"
  ) {

    const reply =
      "I couldn't find that information in our knowledge base.";

    await ConversationService.addMessage({
      callId,
      role: "ASSISTANT",
      content: reply,
    });

    await EventPublisher.publish(
      AppEvent.CONVERSATION_MESSAGE,
      {
        callId,
        role: "ASSISTANT",
        text: reply,
        timestamp: Date.now(),
      }
    );

    RealtimeService.assistant(
      callId,
      reply
    );

    //----------------------------------------
    // Send Fallback Reply to Voice Pipeline
    //----------------------------------------

    void VoiceWorker.start(callId);

    await VoiceWorker.addText(
      callId,
      reply
    );

    return reply;
  }

  //----------------------------------------
  // Start Voice Playback Worker
  //----------------------------------------

  void VoiceWorker.start(callId);

  //----------------------------------------
  // Gemini Streaming State
  //----------------------------------------

  const generationStartedAt =
    performance.now();

  let firstToken = true;

  let fullReply = "";

  let wasAborted = false;

  //----------------------------------------
  // Create Per-Call Abort Controller
  //----------------------------------------

  const controller =
    ConversationAbort.create(callId);

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

      //----------------------------------------
      // Stop Processing After Barge-In
      //----------------------------------------

      if (controller.signal.aborted) {

        wasAborted = true;

        log.info(
          "Gemini stream interrupted by caller"
        );

        break;

      }

      if (!chunk) {

        continue;

      }

      //----------------------------------------
      // Time To First Token
      //----------------------------------------

      if (firstToken) {

        firstToken = false;

        log.info(
          {
            latencyMs: Number(
              (
                performance.now() -
                generationStartedAt
              ).toFixed(0)
            ),
          },
          "First Gemini token received"
        );

      }

      process.stdout.write(chunk);

      fullReply += chunk;

      //----------------------------------------
      // Add Tokens to Sentence Buffer
      //----------------------------------------

      sentenceBuffer.append(
        callId,
        chunk
      );

      //----------------------------------------
      // Queue Every Complete Sentence for TTS
      //----------------------------------------

      await sentenceBuffer
        .flushCompleteSentences(
          callId,
          async (sentence) => {

            if (
              controller.signal.aborted
            ) {

              return;

            }

            log.debug(
              {
                sentence,
              },
              "Complete sentence ready for TTS"
            );

            await VoiceWorker.addText(
              callId,
              sentence
            );

          }
        );

    }

    //----------------------------------------
    // Queue Remaining Incomplete Sentence
    //----------------------------------------

    if (
      !controller.signal.aborted
    ) {

      await sentenceBuffer
        .flushRemaining(
          callId,
          async (sentence) => {

            if (
              controller.signal.aborted
            ) {

              return;

            }

            log.debug(
              {
                sentence,
              },
              "Remaining sentence ready for TTS"
            );

            await VoiceWorker.addText(
              callId,
              sentence
            );

          }
        );

    }

  } catch (error) {

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {

      wasAborted = true;

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
  // Interrupted Response
  //----------------------------------------

  if (
    wasAborted ||
    controller.signal.aborted
  ) {

    sentenceBuffer.clear(callId);

    log.info(
      {
        generatedCharacters:
          fullReply.length,
      },
      "Interrupted AI response discarded"
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
          ).toFixed(0)
        ),
    },
    "Gemini stream finished"
  );

  //----------------------------------------
  // Prevent Empty Assistant Messages
  //----------------------------------------

  const finalReply =
    fullReply.trim();

  if (!finalReply) {

    log.warn(
      "Gemini returned an empty response"
    );

    ConversationStateService.setState(
      callId,
      "LISTENING"
    );

    ConversationEvents.emit(
      "listening",
      callId
    );

    return "";

  }

  //----------------------------------------
  // Save Assistant Reply
  //----------------------------------------

  await ConversationService.addMessage({
    callId,
    role: "ASSISTANT",
    content: finalReply,
  });

  RealtimeService.assistant(
    callId,
    finalReply
  );

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,
      role: "ASSISTANT",
      text: finalReply,
      timestamp: Date.now(),
    }
  );

  //----------------------------------------
  // Load Full Conversation
  //----------------------------------------

  const conversation =
    await ConversationService
      .getConversation(callId);

  if (!conversation) {

    log.warn(
      "Conversation not found after AI response"
    );

    return finalReply;

  }

  //----------------------------------------
  // Build Full Transcript
  //----------------------------------------

  const transcript =
    conversation.messages
      .map(
        (item) =>
          `${item.role}: ${item.content}`
      )
      .join("\n");

  log.debug(
    {
      transcript,
    },
    "Conversation transcript built"
  );

  //----------------------------------------
  // Update Memory Every Five Messages
  //----------------------------------------

  if (
    conversation.messages.length > 0 &&
    conversation.messages.length % 5 === 0
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
          timestamp: Date.now(),
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
  // Conversation Analysis
  //----------------------------------------

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
        timestamp: Date.now(),
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

  //----------------------------------------
  // Detect and Execute AI Actions
  //----------------------------------------

  try {

    log.info(
      "Detecting conversation actions"
    );

    const action =
      await detectAction(
        transcript
      );

    if (
      action.action !== "NONE"
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

  //----------------------------------------
  // Conversation Turn Completed
  //----------------------------------------

  log.info(
    {
      replyLength:
        finalReply.length,
    },
    "Conversation turn completed"
  );

  RealtimeService.completed(
    callId
  );

  return finalReply;
}