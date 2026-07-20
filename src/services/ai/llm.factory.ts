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
  signal?: AbortSignal
): AsyncGenerator<string> {

  for await (
    const chunk of askGeminiStream(
      prompt,
      signal
    )
  ) {

    yield chunk;

  }

}