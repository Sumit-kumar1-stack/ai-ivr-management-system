import { ConversationRepository } from "./conversation.repository";

export async function createConversation(callId: string) {
  return ConversationRepository.create(callId);
}

export async function getConversation(callId: string) {
  return ConversationRepository.findByCall(callId);
}

export async function addConversationMessage(
  conversationId: string,
  role: "SYSTEM" | "USER" | "ASSISTANT",
  content: string
) {
  return ConversationRepository.addMessage({
    conversationId,
    role,
    content,
  });
}

export async function saveConversationSummary(
  conversationId: string,
  summary: string
) {
  return ConversationRepository.updateSummary(
    conversationId,
    summary
  );
}

export const ConversationService = {
  async addMessage(data: {
    callId: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    content: string;
  }) {
    const existingConversation =
      await ConversationRepository.findByCall(data.callId);

    const conversationId = existingConversation
      ? existingConversation.id
      : (await ConversationRepository.create(data.callId)).id;

    return ConversationRepository.addMessage({
      conversationId,
      role: data.role,
      content: data.content,
    });
  },

  async getConversation(callId: string) {
    return ConversationRepository.findByCall(callId);
  },
};

export async function saveConversationAnalysis(
  conversationId: string,
  analysis: {
    summary: string;
    intent: string;
    sentiment: string;
    priority: string;
    followUp: boolean;
    actionItems: string[];
  }
) {
  return ConversationRepository.updateAnalysis(
    conversationId,
    analysis
  );
}