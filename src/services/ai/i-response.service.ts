import {
  askAI,
  askAIStream,
} from "@/services/ai/llm.factory";

export async function generateAIResponse(
  prompt: string
) {
  return askAI(prompt);
}

export function generateAIResponseStream(
  prompt: string
) {
  return askAIStream(prompt);
}