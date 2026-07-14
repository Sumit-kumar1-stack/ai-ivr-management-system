import {
  askGemini,
  askGeminiStream,
} from "./gemini.service";

export async function askAI(
  prompt: string
) {

  return askGemini(prompt);

}

export async function* askAIStream(
  prompt: string
) {

  for await (
    const chunk of askGeminiStream(prompt)
  ) {

    yield chunk;

  }

}