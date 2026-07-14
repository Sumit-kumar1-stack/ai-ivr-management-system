import { performance } from "perf_hooks";

import { ConversationService } from "./conversation.service";
import { buildPrompt } from "./prompt-builder.service";

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
  updateConversationMemory,
} from "./memory.service";

import {
  saveConversationAnalysis,
} from "./conversation.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  sentenceBuffer,
} from "@/services/voice/sentence-buffer.service";

import {
  ConversationStateService,
} from "./conversation-state.service";

import {
  ConversationEvents,
} from "./conversation-events.service";

import {
  SilenceDetector,
} from "./silence-detector.service";

export async function startConversation(
  callId: string
) {

  //----------------------------------------
  // Greeting
  //----------------------------------------

  await ConversationService.addMessage({

    callId,

    role: "ASSISTANT",

    content:
      "Hello. Welcome to ABC Company. How may I help you today?",

  });

  //----------------------------------------
  // Initial State
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

export async function processUserMessage(
  callId: string,
  message: string
) {

  //----------------------------------------
  // Stop Silence Timer
  //----------------------------------------

  SilenceDetector.stop(callId);

  //----------------------------------------
  // Save User Message
  //----------------------------------------

  await ConversationService.addMessage({

    callId,

    role: "USER",

    content: message,

  });

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
  // Build Prompt
  //----------------------------------------

  const prompt =
    await buildPrompt(
      callId,
      message
    );

  console.log(
    "\n========== PROMPT ==========\n"
  );

  console.log(prompt);

  console.log(
    "\n============================\n"
  );

  //----------------------------------------
  // No Knowledge
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

    await VoiceWorker.addText(
      callId,
      reply
    );

    ConversationStateService.setState(
      callId,
      "LISTENING"
    );

    ConversationEvents.emit(
      "listening",
      callId
    );

    return reply;

  }

  //----------------------------------------
  // Speaking State
  //----------------------------------------

  ConversationStateService.setState(
    callId,
    "SPEAKING"
  );

  ConversationEvents.emit(
    "speaking",
    callId
  );

  //----------------------------------------
  // Start Voice Worker
  //----------------------------------------

  VoiceWorker.start(callId);

  //----------------------------------------
  // Streaming Variables
  //----------------------------------------

  const start =
    performance.now();

  let firstToken =
    true;

  let fullReply =
    "";

  console.log(
    "\n========== GEMINI STREAM ==========\n"
  );

  //----------------------------------------
  // Stream Gemini
  //----------------------------------------

  for await (
    const chunk of generateAIResponseStream(
      prompt
    )
  ) {

    //----------------------------------------
    // Time To First Token
    //----------------------------------------

    if (firstToken) {

      firstToken = false;

      console.log(
        `⚡ First Token ${(
          performance.now() -
          start
        ).toFixed(0)} ms`
      );

    }

    process.stdout.write(
      chunk
    );

    fullReply += chunk;

    //----------------------------------------
    // Sentence Buffer
    //----------------------------------------

    sentenceBuffer.append(
      callId,
      chunk
    );

    await sentenceBuffer.flushCompleteSentences(
      callId,
      async (sentence) => {

        console.log(
          "\n🗣 Sentence Ready"
        );

        console.log(
          sentence
        );

        await VoiceWorker.addText(
          callId,
          sentence
        );

      }
    );

  }

    //----------------------------------------
  // Flush Remaining Sentence
  //----------------------------------------

  await sentenceBuffer.flushRemaining(
    callId,
    async (sentence) => {

      console.log(
        "\n🗣 Final Sentence"
      );

      console.log(sentence);

      await VoiceWorker.addText(
        callId,
        sentence
      );

    }
  );

  console.log(
    "\n\n===================================\n"
  );

  //----------------------------------------
  // Back To Listening
  //----------------------------------------

  ConversationStateService.setState(
    callId,
    "LISTENING"
  );

  ConversationEvents.emit(
    "listening",
    callId
  );

  //----------------------------------------
  // Save Assistant Reply
  //----------------------------------------

  await ConversationService.addMessage({

    callId,

    role: "ASSISTANT",

    content: fullReply,

  });

  //----------------------------------------
  // Load Conversation
  //----------------------------------------

  const conversation =
    await ConversationService.getConversation(
      callId
    );

  if (!conversation) {

    return fullReply;

  }

  //----------------------------------------
  // Build Transcript
  //----------------------------------------

  const transcript =
    conversation.messages
      .map(
        (message) =>
          `${message.role}: ${message.content}`
      )
      .join("\n");

  console.log(
    "\n========== TRANSCRIPT ==========\n"
  );

  console.log(transcript);

  console.log(
    "\n===============================\n"
  );

  //----------------------------------------
  // Update Memory Every 5 Messages
  //----------------------------------------

  if (
    conversation.messages.length > 0 &&
    conversation.messages.length % 5 === 0
  ) {

    console.log(
      "🧠 Updating Conversation Memory..."
    );

    const summary =
      await generateConversationSummary(
        transcript
      );

    await updateConversationMemory(
      callId,
      summary
    );

    console.log(
      "✅ Memory Updated"
    );

  }

  //----------------------------------------
  // Conversation Analysis
  //----------------------------------------

  console.log(
    "📊 Generating Conversation Analysis..."
  );

  const analysis =
    await generateConversationAnalysis(
      transcript
    );

  await saveConversationAnalysis(
    conversation.id,
    analysis
  );

  console.log(
    "✅ Analysis Saved"
  );

    //----------------------------------------
  // Detect Actions
  //----------------------------------------

  try {

    console.log(
      "🤖 Detecting Actions..."
    );

    const action =
      await detectAction(
        transcript
      );

    if (
      action?.action &&
      action.action !== "NONE"
    ) {

      console.log(
        `✅ Action Detected: ${action.action}`
      );

      await executeAction(
        action.action,
        callId
      );

    } else {

      console.log(
        "ℹ️ No Action Required"
      );

    }

  } catch (error) {

    console.error(
      "❌ Action Detection Error:",
      error
    );

  }

  //----------------------------------------
  // Conversation Finished
  //----------------------------------------

  console.log(
    "\n========== CONVERSATION COMPLETE ==========\n"
  );

  console.log(
    `Call ID : ${callId}`
  );

  console.log(
    `Reply Length : ${fullReply.length} characters`
  );

  console.log(
    "\n===========================================\n"
  );

  //----------------------------------------
  // Return Final Reply
  //----------------------------------------

  return fullReply;

}