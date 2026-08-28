function requireEnv(
  name: string
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `${name} is missing from the environment`
    );
  }

  return value;
}

export const AI_CONFIG = {
  geminiApiKey:
    requireEnv(
      "GEMINI_API_KEY"
    ),

  deepgramApiKey:
    requireEnv(
      "DEEPGRAM_API_KEY"
    ),
};