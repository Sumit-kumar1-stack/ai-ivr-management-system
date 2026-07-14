import { askAI } from "@/services/ai/llm.factory";

export async function rewriteQuery(
  history: string,
  question: string
) {
  const prompt = `
You rewrite customer questions for retrieval.

Conversation:

${history}

Latest Question:

${question}

Rewrite the latest question into a standalone search query.

Only return the rewritten query.

Do not answer it.
`;

  const rewritten =
    await askAI(prompt);

  return rewritten.trim();
}