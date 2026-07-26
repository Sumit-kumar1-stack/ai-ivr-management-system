import { prisma } from "@/lib/prisma";

import { bm25Score } from "./bm25.service";
import { rerankKnowledge } from "./reranker.service";

export async function retrieveKnowledge(
  question: string,
  limit = 5
) {
  //--------------------------------------------------
  // Load all chunks
  //--------------------------------------------------

  const chunks =
    await prisma.knowledgeChunk.findMany();

  console.log("\n========== BM25 SEARCH ==========");

  console.log("Question:");
  console.log(question);

  console.log(
    "Knowledge Chunks:",
    chunks.length
  );

  //--------------------------------------------------
  // BM25
  //--------------------------------------------------

  const scored =
    chunks
      .map((chunk) => ({
        ...chunk,
        score: bm25Score(
          question,
          chunk.content
        ),
      }))
      .filter(
        (chunk) =>
          chunk.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 20);

  console.log("\nTop BM25 Candidates\n");

  scored.forEach(
    (chunk, index) => {
      console.log(
        `${index + 1}. Score=${chunk.score.toFixed(
          3
        )}`
      );

      console.log(chunk.content);

      console.log("----------------------");
    }
  );

  console.log(
    "==============================\n"
  );

  //--------------------------------------------------
  // Gemini Re-ranking
  //--------------------------------------------------

  if (scored.length === 0) {
    console.log("No candidates found, skipping Gemini reranking.");
    return [];
  }

  if (scored.length === 1) {
    console.log("Only one candidate found, skipping Gemini reranking.");
    return [{
      content: scored[0].content,
      score: scored[0].score,
      documentId: scored[0].documentId,
      chunkIndex: scored[0].chunkIndex,
    }];
  }

  const reranked =
    await rerankKnowledge(
      question,
      scored
    );

  console.log(
    "\n========== RERANKED =========="
  );

  reranked.forEach(
    (chunk, index) => {
      console.log(
        `${index + 1}. Score=${chunk.score.toFixed(
          3
        )}`
      );

      console.log(chunk.content);

      console.log("----------------------");
    }
  );

  console.log(
    "==============================\n"
  );

  //--------------------------------------------------
  // Final Top K
  //--------------------------------------------------

  return reranked
    .slice(0, limit)
    .map((chunk) => ({
      content:
        chunk.content,
      score:
        chunk.score,
      documentId:
        chunk.documentId,
      chunkIndex:
        chunk.chunkIndex,
    }));
}