import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.GEMINI_API_KEY?.trim();

const modelName =
  process.env.GEMINI_TEXT_MODEL?.trim() ||
  "gemini-3.5-flash";

async function main(): Promise<void> {
  console.log("Starting Gemini test...");

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing from .env"
    );
  }

  console.log("Gemini configuration:", {
    keyPresent: true,
    keyLength: apiKey.length,
    modelName,
  });

  const ai = new GoogleGenAI({
    apiKey,
  });

  console.log("Sending request to Gemini...");

  const response =
    await ai.models.generateContent({
      model: modelName,
      contents:
        "Reply exactly with: Gemini text test passed.",
    });

  console.log("Gemini response:");

  console.log(
    response.text ||
      "Gemini returned an empty response"
  );
}

main()
  .then(() => {
    console.log("Test script completed.");
  })
  .catch((error: unknown) => {
    const err =
      error instanceof Error
        ? error
        : new Error(String(error));

    console.error("Gemini test failed:");

    console.error({
      name: err.name,
      message: err.message,
      stack: err.stack,
    });

    process.exitCode = 1;
  });