const DEFAULT_MAX_WORDS =
  35;

const DEFAULT_MAX_SENTENCES =
  2;

const configuredMaxWords =
  Number(
    process.env
      .VOICE_RESPONSE_MAX_WORDS
  );

const configuredMaxSentences =
  Number(
    process.env
      .VOICE_RESPONSE_MAX_SENTENCES
  );

const MAX_WORDS =
  Number.isInteger(
    configuredMaxWords
  ) &&
  configuredMaxWords >= 15 &&
  configuredMaxWords <= 80
    ? configuredMaxWords
    : DEFAULT_MAX_WORDS;

const MAX_SENTENCES =
  Number.isInteger(
    configuredMaxSentences
  ) &&
  configuredMaxSentences >= 1 &&
  configuredMaxSentences <= 4
    ? configuredMaxSentences
    : DEFAULT_MAX_SENTENCES;

//--------------------------------------------------
// Prompt Policy
//--------------------------------------------------

export function getVoiceResponseInstruction():
  string {
  return `
VOICE RESPONSE POLICY:

You are speaking to a customer over a phone call.

- Answer naturally and directly.
- Prefer 20 to ${MAX_WORDS} words.
- Use no more than ${MAX_SENTENCES} short sentences unless extra detail is required for safety or correctness.
- Do not use markdown.
- Do not use bullet points.
- Do not use headings.
- Avoid long introductions.
- Do not repeat the customer's question.
- Give the most important answer first.
- Ask at most one short follow-up question.
- Never omit important safety, eligibility, consent, financial, or compliance information just to satisfy the word limit.
`.trim();
}

//--------------------------------------------------
// Output Cleanup
//--------------------------------------------------

function normalizeWhitespace(
  text: string
): string {
  return text
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function splitSentences(
  text: string
): string[] {
  const normalized =
    normalizeWhitespace(
      text
    );

  if (
    !normalized
  ) {
    return [];
  }

  return normalized
    .split(
      /(?<=[.!?])\s+/
    )
    .map(
      (sentence) =>
        sentence.trim()
    )
    .filter(Boolean);
}

//--------------------------------------------------
// Spoken Response Guard
//--------------------------------------------------

export function applyVoiceResponsePolicy(
  response: string
): string {
  const normalized =
    normalizeWhitespace(
      response
    );

  if (
    !normalized
  ) {
    return "";
  }

  const sentences =
    splitSentences(
      normalized
    );

  const selectedSentences =
    sentences
      .slice(
        0,
        MAX_SENTENCES
      )
      .join(
        " "
      );

  const candidate =
    selectedSentences ||
    normalized;

  const words =
    candidate.split(
      /\s+/
    );

  if (
    words.length <=
    MAX_WORDS
  ) {
    return candidate;
  }

  /*
   * Do not cut the response in the middle
   * of an arbitrary word.
   *
   * This is a final defensive guard.
   * The prompt policy should normally keep
   * the model below this limit itself.
   */
  const shortened =
    words
      .slice(
        0,
        MAX_WORDS
      )
      .join(
        " "
      )
      .replace(
        /[,;:]$/,
        ""
      )
      .trim();

  if (
    /[.!?]$/.test(
      shortened
    )
  ) {
    return shortened;
  }

  return `${shortened}.`;
}

export const VoiceResponsePolicy = {
  maxWords:
    MAX_WORDS,

  maxSentences:
    MAX_SENTENCES,

  getInstruction:
    getVoiceResponseInstruction,

  apply:
    applyVoiceResponsePolicy,
};