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
  createCallLogger,
} from "@/lib/logger";  


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

  const log = createCallLogger(callId);

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

log.info(
  {
    prompt,
  },
  "Prompt generated"
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

log.info("Gemini streaming started");

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

log.info(
  {
    latencyMs: Number(
      (
        performance.now() -
        start
      ).toFixed(0)
    ),
  },
  "First token received"
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

 log.debug(
  {
    sentence,
  },
  "Sentence ready for TTS"
);

        await VoiceWorker.addText(
          callId,
          sentence
        );

      }
    );

  }

    //----------------------------------------
  //----------------------------------------
  // Flush Remaining Sentence
  //----------------------------------------

  await sentenceBuffer.flushRemaining(
    callId,
    async (sentence) => {

      log.debug(
        {
          sentence,
        },
        "Final sentence queued for TTS"
      );

      await VoiceWorker.addText(
        callId,
        sentence
      );

    }
  );

  log.info("Gemini stream finished");

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

log.debug(
  {
    transcript,
  },
  "Conversation transcript"
);

  //----------------------------------------
  // Update Memory Every 5 Messages
  //----------------------------------------

  if (
    conversation.messages.length > 0 &&
    conversation.messages.length % 5 === 0
  ) {

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

log.info(
  "Conversation memory updated"
);

  }

  //----------------------------------------
  // Conversation Analysis
  //----------------------------------------

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

log.info(
  "Conversation analysis saved"
);

    //----------------------------------------
  // Detect Actions
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
      action?.action &&
      action.action !== "NONE"
    ) {

log.info(
  {
    action: action.action,
  },
  "Action detected"
);

      await executeAction(
        action.action,
        callId
      );

    } else {

    log.info(
  "No action required"
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
  // Conversation Finished
  //----------------------------------------

log.info(
  {
    replyLength: fullReply.length,
  },
  "Conversation completed"
);
  //----------------------------------------
  // Return Final Reply
  //----------------------------------------

  return fullReply;

}