export const AI_CONFIG = {
  provider: process.env.AI_PROVIDER ?? "gemini",

  geminiApiKey:
    process.env.GEMINI_API_KEY ?? "",
};