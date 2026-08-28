export interface CreateConversationDTO {
  callId: string;
}

export interface AddMessageDTO {
  conversationId: string;

  role: "SYSTEM" | "USER" | "ASSISTANT";

  content: string;
}