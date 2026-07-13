import { ConversationRepository } from "./conversation.repository";

export async function createConversation(
  callId: string
) {
  return ConversationRepository.create(callId);
}

export async function getConversation(
  callId: string
) {
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