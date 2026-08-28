import { generateAIResponse } from "./ai-response.service";

export async function generateConversationSummary(
  conversation: string
) {
  const prompt = `
You are an AI call center assistant.

Summarize the following customer conversation.

Return only the summary.

Conversation:

${conversation}
`;

  return generateAIResponse(prompt);
}