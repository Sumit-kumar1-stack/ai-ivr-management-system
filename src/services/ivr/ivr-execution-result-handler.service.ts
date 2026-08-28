import { AppEvent, EventPublisher } from "@/core/events";

import { createCallLogger } from "@/lib/logger";

import { ConversationService } from "@/services/conversations/conversation.service";
import { ConversationStateService } from "@/services/conversations/conversation-state.service";
import { VoiceWorker } from "@/services/voice/voice-worker.service";

import type { IVRGraphExecutionResult } from "./ivr-graph-executor.service";

export interface HandleIVRGraphExecutionOptions {
  turnId?: number;
  recordConversationMessage?: boolean;
}

export interface HandleIVRGraphExecutionOutcome {
  queuedSpeech: boolean;
  terminal: boolean;
  spokenText: string | null;
}

export async function handleIVRGraphExecutionResult(
  callId: string,
  execution: IVRGraphExecutionResult,
  options: HandleIVRGraphExecutionOptions = {}
): Promise<HandleIVRGraphExecutionOutcome> {
  const log = createCallLogger(callId);
  const state = ConversationStateService.getState(callId);

  if (["ENDED", "INTERRUPTING", "INTERRUPTED"].includes(state)) {
    return { queuedSpeech: false, terminal: true, spokenText: null };
  }

  if (execution.endCall) {
    ConversationStateService.setState(callId, "TERMINATING");
  } else if (execution.speechText) {
    ConversationStateService.setState(callId, "THINKING");
  }

  const speechText = execution.speechText?.trim() ?? "";
  let queuedSpeech = false;

  if (speechText) {
    void VoiceWorker.start(callId);
    queuedSpeech =
      options.turnId !== undefined
        ? await VoiceWorker.addText(callId, speechText, options.turnId)
        : await VoiceWorker.addText(callId, speechText);

    if (options.recordConversationMessage !== false) {
      await ConversationService.addMessage({
        callId,
        role: "ASSISTANT",
        content: speechText,
      });

      await EventPublisher.publish(AppEvent.CONVERSATION_MESSAGE, {
        callId,
        role: "ASSISTANT",
        text: speechText,
        timestamp: Date.now(),
      });
    }

    if (execution.endCall) {
      if (!queuedSpeech) {
        ConversationStateService.setState(callId, "ENDED");
      }
    } else if (!queuedSpeech) {
      ConversationStateService.setState(callId, "LISTENING");
    }
  } else if (execution.awaitInput) {
    ConversationStateService.setState(callId, "LISTENING");
  } else if (execution.endCall) {
    ConversationStateService.setState(callId, "TERMINATING");
    ConversationStateService.setState(callId, "ENDED");
  }

  if (execution.endCall && !queuedSpeech && !speechText) {
    log.info(
      {
        event: "ivr.execution.terminal_completed",
        currentNodeId: execution.currentNodeId,
        transitionReason: execution.transitionReason,
      },
      "IVR execution completed terminal shutdown"
    );
  }

  return {
    queuedSpeech,
    terminal: execution.endCall,
    spokenText: speechText || null,
  };
}
