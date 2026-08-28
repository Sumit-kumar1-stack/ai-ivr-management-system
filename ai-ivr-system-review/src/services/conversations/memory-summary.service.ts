import { generateAIResponse }
from "./ai-response.service";

export async function summarizeConversation(
  conversation: string
) {

const prompt = `

Summarize the following conversation.

Keep important facts only.

Limit to 100 words.

Conversation

${conversation}

`;

return await generateAIResponse(
prompt
);

}