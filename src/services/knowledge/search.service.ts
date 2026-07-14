import { prisma } from "@/lib/prisma";

export async function searchKnowledge(
  query: string
) {
  const chunks =
    await prisma.knowledgeChunk.findMany({
      take: 5,
    });

  if (!chunks.length) {
    return [];
  }

  // Temporary keyword ranking

  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      score:
        query
          .toLowerCase()
          .split(" ")
          .filter((word) =>
            chunk.content
              .toLowerCase()
              .includes(word)
          ).length,
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 5);
}