import { prisma } from "@/lib/prisma";

export async function indexDocuments(
  documentId: string,
  chunks: string[]
) {
  console.log("\n========== INDEXING ==========");

  for (
    let i = 0;
    i < chunks.length;
    i++
  ) {
    console.log(
      `Saving Chunk ${i + 1}`
    );

    await prisma.knowledgeChunk.create({
      data: {
        documentId,
        chunkIndex: i,
        content: chunks[i],
      },
    });

    console.log(
      `Saved Chunk ${i + 1}`
    );
  }

  console.log("==============================\n");
}