import { ConversationService } from "@/services/conversations/conversation.service";
import { buildPrompt } from "@/services/conversations/prompt-builder.service";
import { generateAIResponse } from "./ai-response.service"; 

export async function chatWithAI(
  callId: string,
  userMessage: string
) {
  await ConversationService.addMessage({
    callId,
    role: "USER",
    content: userMessage,
  });

  const prompt = await buildPrompt(
    callId,
    userMessage
  );

  const aiReply =
    await generateAIResponse(prompt);

  await ConversationService.addMessage({
    callId,
    role: "ASSISTANT",
    content: aiReply,
  });

  return aiReply;
}

