import {
  askGemini,
  askGeminiStream,
} from "./gemini.service";

export async function askAI(
  prompt: string
): Promise<string> {

  return askGemini(prompt);

}

export async function* askAIStream(
  prompt: string,
  signal?: AbortSignal,
  onUsage?: (usage: { inputTokens?: number | null; outputTokens?: number | null }) => void
): AsyncGenerator<string> {

  for await (
    const chunk of askGeminiStream(
      prompt,
      signal,
      onUsage
    )
  ) {

    yield chunk;

  }

}
