import { GoogleGenAI } from "@google/genai";

import { AI_CONFIG } from "@/config/ai";

const ai = new GoogleGenAI({

  apiKey: AI_CONFIG.geminiApiKey,

});

/**
 * Standard completion
 */
export async function askGemini(
  prompt: string
): Promise<string> {

  const response =
    await ai.models.generateContent({

      model: "gemini-2.5-flash",

      contents: prompt,

    });

  return response.text ?? "";

}

/**
 * Streaming completion
 */
export async function* askGeminiStream(
  prompt: string
): AsyncGenerator<string> {

  const stream =
    await ai.models.generateContentStream({

      model: "gemini-2.5-flash",

      contents: prompt,

    });

  for await (const chunk of stream) {

    const text =
      chunk.text ?? "";

    if (!text) {

      continue;

    }

    yield text;

  }

}