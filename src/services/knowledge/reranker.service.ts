import { askAI } from "@/services/ai/llm.factory";

export async function rerankKnowledge(
  question: string,
  chunks: {
    content: string;
    score: number;
    documentId: string;
    chunkIndex: number;
  }[]
) {
  if (chunks.length === 0) {
    return [];
  }

  const candidates = chunks
    .map(
      (chunk, index) => `
Candidate ${index + 1}

${chunk.content}
`
    )
    .join("\n----------------------\n");

  const prompt = `
You are an expert retrieval ranking system.

A user asked the following question:

"${question}"

Below are candidate knowledge chunks.

Your task is:

1. Select ONLY the chunks that actually answer the question.
2. Rank them from best to worst.
3. Return ONLY the candidate numbers.
4. Do NOT explain.

Example outputs:

1

or

1,2

or

2,5,7

========================

${candidates}

========================

Answer:
`;

  console.log("\n========== RERANK ==========");
  console.log(prompt);
  console.log("============================\n");

  const response = await askAI(prompt);

  console.log("Gemini Ranking:", response);

  const indexes = response
    .split(",")
    .map((x) => parseInt(x.trim()))
    .filter((n) => !isNaN(n));

  return indexes
    .map((index) => chunks[index - 1])
    .filter(Boolean);
}