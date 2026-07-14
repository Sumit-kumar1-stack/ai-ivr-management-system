import { generateAIResponse } from "./ai-response.service";

export interface ConversationAnalysis {
  intent: string;
  sentiment: string;
  priority: string;
  followUp: boolean;
  actionItems: string[];
  summary: string;
}

export async function generateConversationAnalysis(
  transcript: string
): Promise<ConversationAnalysis> {
  const prompt = `
You are an AI Call Center Analyst.

Analyze the following conversation.

Return ONLY valid JSON.

Example:

{
  "intent":"Personal Loan",
  "sentiment":"Positive",
  "priority":"High",
  "followUp":true,
  "actionItems":[
    "Schedule callback",
    "Send brochure"
  ],
  "summary":"Customer wants a personal loan."
}

Conversation:

${transcript}
`;

const result =
  await generateAIResponse(prompt);

const match = result.match(/\{[\s\S]*\}/);

if (!match) {
  console.error(result);
  throw new Error("No valid JSON returned by AI.");
}

try {
  return JSON.parse(match[0]);
} catch (err) {
  console.error(result);
  throw err;
}
}