const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "of",
  "to",
  "for",
  "and",
  "or",
  "in",
  "on",
  "at",
  "with",
  "what",
  "which",
  "how",
  "can",
  "i",
  "me",
  "my",
  "you",
  "your",
  "it",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 1 &&
        !STOP_WORDS.has(word)
    );
}