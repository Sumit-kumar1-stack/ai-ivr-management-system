import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "knowledge-indexer"
  );

//--------------------------------------------------
// Index Knowledge Chunks
//--------------------------------------------------

export async function indexDocuments(
  documentId: string,
  chunks: string[]
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  if (
    chunks.length ===
    0
  ) {
    log.debug(
      {
        event:
          "knowledge.indexing.skipped",

        documentId,

        reason:
          "no_chunks",
      },
      "Knowledge indexing skipped"
    );

    return;
  }

  log.info(
    {
      event:
        "knowledge.indexing.started",

      documentId,

      chunkCount:
        chunks.length,

      totalCharacterCount:
        chunks.reduce(
          (
            total,
            chunk
          ) =>
            total +
            chunk.length,
          0
        ),
    },
    "Knowledge chunk indexing started"
  );

  try {
    await prisma.$transaction(
      chunks.map(
        (
          chunk,
          index
        ) =>
          prisma.knowledgeChunk.create({
            data: {
              documentId,

              chunkIndex:
                index,

              content:
                chunk,
            },
          })
      )
    );

    log.info(
      {
        event:
          "knowledge.indexing.completed",

        documentId,

        chunkCount:
          chunks.length,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Knowledge chunk indexing completed"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "knowledge.indexing.failed",

        documentId,

        chunkCount:
          chunks.length,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Knowledge chunk indexing failed"
    );

    throw error;
  }
}