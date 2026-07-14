import { GoogleGenAI } from "@google/genai";

import { AI_CONFIG } from "@/config/ai";

const ai = new GoogleGenAI({
  apiKey: AI_CONFIG.geminiApiKey,
});

export async function* askGeminiStream(
  prompt: string
): AsyncGenerator<string> {
  console.log(
    "\n========== GEMINI STREAM ==========\n"
  );

  const stream =
    await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

  for await (const chunk of stream) {
    const text =
      chunk.text ?? "";

    if (!text.trim()) {
      continue;
    }

    console.log(text);

    const words =
      text.split(/\s+/);

    for (const word of words) {
      if (!word) continue;

      yield word + " ";
    }
  }

  console.log(
    "\n========== STREAM END ==========\n"
  );
}