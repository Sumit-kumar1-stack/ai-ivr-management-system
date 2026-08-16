import {
  createServerLogger,
  getDurationMs,
} from "@/lib/logger";

import {
  retrieveKnowledge,
} from "@/services/knowledge/retrieval.service";

import {
  rewriteQuery,
} from "@/services/knowledge/query-rewriter.service";

import {
  buildOutboundContextPrompt,
  resolveOutboundConversationContext,
} from "@/services/campaigns/outbound-conversation-context.service";

import {
  ConversationService,
} from "./conversation.service";

import {
  getConversationMemory,
} from "./memory.service";

import {
  routeConversationMessage,
} from "./conversation-route.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "prompt-builder"
  );

//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_RECENT_MESSAGES =
  8;

const KNOWLEDGE_LIMIT =
  4;

//--------------------------------------------------
// Build Prompt
//--------------------------------------------------

export async function buildPrompt(
  callId: string,
  latestMessage: string
): Promise<string> {
  const startedAt =
    process.hrtime.bigint();

  //--------------------------------------------------
  // Normalize Input
  //--------------------------------------------------

  const normalizedMessage =
    latestMessage.trim();

  //--------------------------------------------------
  // Conversation
  //--------------------------------------------------

  const conversation =
    await ConversationService.getConversation(
      callId
    );

  const history =
    conversation?.messages ??
    [];

  /*
   * Only recent conversational context is required
   * for a live voice turn.
   *
   * Full history remains available for post-call
   * analysis and summarization.
   */
  const recentHistory =
    history.slice(
      -MAX_RECENT_MESSAGES
    );

  const transcript =
    recentHistory
      .map(
        message =>
          `${message.role}: ${message.content}`
      )
      .join(
        "\n"
      );

  //--------------------------------------------------
  // Memory
  //--------------------------------------------------

  const memory =
    await getConversationMemory(
      callId
    );

  //--------------------------------------------------
  // Outbound Campaign Context
  //--------------------------------------------------

  const outboundContextStartedAt =
    process.hrtime.bigint();

  const outboundContext =
    await resolveOutboundConversationContext(
      callId
    );

  const outboundContextPrompt =
    buildOutboundContextPrompt(
      outboundContext
    );

  const outboundContextMs =
    getDurationMs(
      outboundContextStartedAt
    );

  log.debug(
    {
      event:
        "prompt.outbound_context.resolved",

      callId,

      outbound:
        outboundContext.outbound,

      campaignId:
        outboundContext.campaignId,

      campaignName:
        outboundContext.campaignName,

      purpose:
        outboundContext.purpose,

      contextPresent:
        Boolean(
          outboundContextPrompt
        ),

      contextCharacterCount:
        outboundContextPrompt.length,

      durationMs:
        outboundContextMs,
    },
    "Outbound conversation context resolved"
  );

  //--------------------------------------------------
  // Route
  //--------------------------------------------------

  const routingStartedAt =
    process.hrtime.bigint();

  const route =
    routeConversationMessage(
      transcript,
      normalizedMessage
    );

  const routingMs =
    getDurationMs(
      routingStartedAt
    );

  log.info(
    {
      event:
        "prompt.route.selected",

      callId,

      route:
        route.route,

      reason:
        route.reason,

      historyMessageCount:
        history.length,

      recentHistoryMessageCount:
        recentHistory.length,

      outbound:
        outboundContext.outbound,

      outboundPurpose:
        outboundContext.purpose,

      routingMs,
    },
    "Conversation prompt route selected"
  );

  //--------------------------------------------------
  // Context-Only Response
  //--------------------------------------------------

  if (
    route.route ===
    "CONTEXT_ONLY"
  ) {
    const prompt =
      `
You are a professional AI Call Center Agent.

The customer is asking you to clarify, repeat, or rephrase something that was already discussed.

Answer ONLY from the approved conversation context, outbound campaign context, and memory below.

Do not perform a new knowledge lookup.

Do not invent new facts.

Never invent:
- account balances
- transactions
- payment status
- application status
- eligibility
- rates
- fees
- dates
- policies
- customer-specific facts
- completed business actions

Never claim that a callback, transfer, payment, application update, account change, or other action succeeded unless an approved system or tool has confirmed it.

If the requested information is not supported by the available conversation context or memory, ask the customer to clarify.

--------------------------------------------------

Outbound Campaign Context

${outboundContextPrompt || "None"}

--------------------------------------------------

Conversation Memory

${memory || "None"}

--------------------------------------------------

Recent Conversation

${transcript || "None"}

--------------------------------------------------

Customer

${normalizedMessage}

--------------------------------------------------

Assistant
`.trim();

    log.info(
      {
        event:
          "prompt.build.completed",

        callId,

        route:
          route.route,

        outbound:
          outboundContext.outbound,

        outboundPurpose:
          outboundContext.purpose,

        queryRewriteUsed:
          false,

        knowledgeRetrievalUsed:
          false,

        promptCharacterCount:
          prompt.length,

        outboundContextMs,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Context-only conversation prompt built"
    );

    return prompt;
  }

  //--------------------------------------------------
  // Decide Retrieval Query
  //--------------------------------------------------

  let retrievalQuery =
    normalizedMessage;

  let queryRewriteUsed =
    false;

  if (
    route.route ===
    "FOLLOW_UP_KNOWLEDGE"
  ) {
    const rewriteStartedAt =
      process.hrtime.bigint();

    retrievalQuery =
      await rewriteQuery(
        transcript,
        normalizedMessage
      );

    retrievalQuery =
      retrievalQuery.trim();

    queryRewriteUsed =
      true;

    log.info(
      {
        event:
          "prompt.query_rewritten",

        callId,

        route:
          route.route,

        originalQueryCharacterCount:
          normalizedMessage.length,

        rewrittenQueryCharacterCount:
          retrievalQuery.length,

        durationMs:
          getDurationMs(
            rewriteStartedAt
          ),
      },
      "Contextual retrieval query prepared"
    );
  } else {
    log.debug(
      {
        event:
          "prompt.query_rewrite.skipped",

        callId,

        route:
          route.route,

        reason:
          "standalone_knowledge_query",
      },
      "Standalone knowledge query does not require rewriting"
    );
  }

  //--------------------------------------------------
  // Retrieval Query Fallback
  //--------------------------------------------------

  if (
    !retrievalQuery
  ) {
    retrievalQuery =
      normalizedMessage;
  }

  //--------------------------------------------------
  // Retrieve Knowledge
  //--------------------------------------------------

  const retrievalStartedAt =
    process.hrtime.bigint();

  const knowledge =
    await retrieveKnowledge(
      retrievalQuery,
      KNOWLEDGE_LIMIT
    );

  const retrievalMs =
    getDurationMs(
      retrievalStartedAt
    );

  log.info(
    {
      event:
        "prompt.knowledge_retrieved",

      callId,

      route:
        route.route,

      queryRewriteUsed,

      retrievedChunkCount:
        knowledge.length,

      retrievalMs,
    },
    "Knowledge retrieved for conversation prompt"
  );

  //--------------------------------------------------
  // No Relevant Knowledge
  //--------------------------------------------------

  if (
    knowledge.length ===
    0
  ) {
    log.info(
      {
        event:
          "prompt.no_relevant_knowledge",

        callId,

        route:
          route.route,

        queryRewriteUsed,

        outbound:
          outboundContext.outbound,

        outboundPurpose:
          outboundContext.purpose,

        retrievalMs,

        outboundContextMs,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "No relevant knowledge found for conversation"
    );

    return "NO_RELEVANT_KNOWLEDGE";
  }

  //--------------------------------------------------
  // Build Knowledge Context
  //--------------------------------------------------

  const knowledgeContext =
    knowledge
      .map(
        (
          item,
          index
        ) =>
          [
            `Source ${index + 1}`,
            item.content,
          ].join(
            "\n\n"
          )
      )
      .join(
        "\n\n"
      );

  //--------------------------------------------------
  // Final Prompt
  //--------------------------------------------------

  const prompt =
    `
You are a professional AI Call Center Agent.

Follow the outbound campaign context when one is provided.

Answer factual questions using ONLY the approved knowledge below.

Use the recent conversation to understand the customer's current question and maintain continuity.

Never invent:
- account balances
- transactions
- payment status
- application status
- eligibility
- rates
- fees
- dates
- policies
- customer-specific facts
- completed business actions

Never claim that a callback, transfer, payment, application update, account change, or other business action succeeded unless an approved system or tool confirms it.

If the approved knowledge does not support the requested factual answer, say:

"I couldn't find that information in our knowledge base."

Keep the response relevant to the current call purpose.

--------------------------------------------------

Outbound Campaign Context

${outboundContextPrompt || "None"}

--------------------------------------------------

Conversation Memory

${memory || "None"}

--------------------------------------------------

Approved Knowledge

${knowledgeContext}

--------------------------------------------------

Recent Conversation

${transcript || "None"}

--------------------------------------------------

Customer

${normalizedMessage}

--------------------------------------------------

Assistant
`.trim();

  //--------------------------------------------------
  // Metrics
  //--------------------------------------------------

  log.info(
    {
      event:
        "prompt.build.completed",

      callId,

      route:
        route.route,

      routeReason:
        route.reason,

      outbound:
        outboundContext.outbound,

      outboundPurpose:
        outboundContext.purpose,

      outboundContextCharacterCount:
        outboundContextPrompt.length,

      promptCharacterCount:
        prompt.length,

      knowledgeChunkCount:
        knowledge.length,

      historyMessageCount:
        history.length,

      recentHistoryMessageCount:
        recentHistory.length,

      queryRewriteUsed,

      knowledgeRetrievalUsed:
        true,

      retrievalMs,

      outboundContextMs,

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "AI conversation prompt built"
  );

  return prompt;
}