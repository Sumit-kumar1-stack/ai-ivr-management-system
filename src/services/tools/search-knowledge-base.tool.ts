import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  retrieveKnowledge,
} from "@/services/knowledge/retrieval.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const searchKnowledgeBaseInputSchema =
  z.object({
    query:
      z
        .string()
        .trim()
        .min(
          2
        )
        .max(
          1000
        ),

    limit:
      z
        .number()
        .int()
        .min(
          1
        )
        .max(
          10
        )
        .optional(),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const searchKnowledgeBaseTool:
  BusinessToolDefinition =
{
  name:
    "searchKnowledgeBase",

  description:
    "Searches the approved knowledge base and returns the strongest supporting chunks.",

  risk:
    "READ_ONLY",

  mutating:
    false,

  requiresConfirmation:
    false,

  timeoutMs:
    7000,

  inputSchema:
    searchKnowledgeBaseInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        searchKnowledgeBaseInputSchema.parse(
          rawInput
        );

      return executeKnowledgeSearch(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeKnowledgeSearch(
  input:
    z.infer<
      typeof searchKnowledgeBaseInputSchema
    >,

  context:
    ToolExecutionContext
) {
  const log =
    createCallLogger(
      context.callId
    );

  //------------------------------------------------
  // Abort Guard
  //------------------------------------------------

  if (
    context.signal.aborted
  ) {
    throw new Error(
      "Knowledge search was cancelled"
    );
  }

  //------------------------------------------------
  // Verify Call
  //------------------------------------------------

  const call =
    await prisma.call.findUnique({
      where: {
        id:
          context.callId,
      },

      select: {
        id:
          true,

        campaignId:
          true,
      },
    });

  if (
    !call
  ) {
    throw new Error(
      `Call not found: ${context.callId}`
    );
  }

  //------------------------------------------------
  // Retrieve
  //------------------------------------------------

  const limit =
    input.limit ??
    5;

  const results =
    await retrieveKnowledge(
      input.query,
      limit
    );

  //------------------------------------------------
  // Abort After Retrieval
  //------------------------------------------------

  if (
    context.signal.aborted
  ) {
    throw new Error(
      "Knowledge search was cancelled"
    );
  }

  //------------------------------------------------
  // Sanitized Results
  //------------------------------------------------

  const chunks =
    results.map(
      (
        result,
        index
      ) => ({
        rank:
          index +
          1,

        content:
          result.content,

        score:
          result.score,

        documentId:
          result.documentId,

        chunkIndex:
          result.chunkIndex,
      })
    );

  //------------------------------------------------
  // Log
  //------------------------------------------------

  log.info(
    {
      event:
        "tool.knowledge_search.completed",

      queryCharacterCount:
        input.query.length,

      requestedLimit:
        limit,

      returnedChunkCount:
        chunks.length,

      campaignId:
        call.campaignId,
    },
    "Knowledge search completed through Tool Gateway"
  );

  return {
    query:
      input.query,

    found:
      chunks.length >
      0,

    chunks,
  };
}