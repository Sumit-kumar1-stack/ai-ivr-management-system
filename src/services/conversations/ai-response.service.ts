import {
  askAI,
  askAIStream,
} from "@/services/ai/llm.factory";

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
  prompt: string,
  signal?: AbortSignal,
  onUsage?: (usage: { inputTokens?: number | null; outputTokens?: number | null }) => void
): AsyncGenerator<string> {

  for await (
    const chunk of askAIStream(
      prompt,
      signal,
      onUsage
    )
  ) {

    yield chunk;

  }

}
