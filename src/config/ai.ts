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

/*
 * This module is consumed by Gemini text, TTS, and Live clients. Deepgram is
 * configured by its own socket only when the Cascaded runtime is selected.
 * Keep the key lazy so importing media modules never makes an unused provider
 * a startup dependency.
 */
export const AI_CONFIG = {
  get geminiApiKey(): string {
    return requireEnv("GEMINI_API_KEY");
  },
};
