import { askAI, askAIStream } from "@/services/ai/llm.factory";

/**
 * Normal response
 */
export async function generateAIResponse(
  prompt: string
): Promise<string> {

  return askAI(prompt);

}

/**
 * Streaming response
 */
export async function* generateAIResponseStream(
  prompt: string
): AsyncGenerator<string> {

  for await (const chunk of askAIStream(prompt)) {

    yield chunk;

  }

}