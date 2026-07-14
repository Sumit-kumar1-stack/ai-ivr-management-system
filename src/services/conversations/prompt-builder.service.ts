import { ConversationService } from "./conversation.service";

import {
  retrieveKnowledge,
} from "@/services/knowledge/retrieval.service";

import {
  getConversationMemory,
} from "./memory.service";

import {
  rewriteQuery,
} from "@/services/knowledge/query-rewriter.service";

export async function buildPrompt(
  callId: string,
  latestMessage: string
) {
  //------------------------------------------------------
  // Conversation
  //------------------------------------------------------

  const conversation =
    await ConversationService.getConversation(
      callId
    );

  const history =
    conversation?.messages ?? [];

  const transcript =
    history
      .map(
        (message) =>
          `${message.role}: ${message.content}`
      )
      .join("\n");

  //------------------------------------------------------
  // Memory
  //------------------------------------------------------

  const memory =
    await getConversationMemory(
      callId
    );

  //------------------------------------------------------
  // Rewrite Query
  //------------------------------------------------------

  const rewrittenQuery =
    await rewriteQuery(
      transcript,
      latestMessage
    );

  console.log(
    "\n========== QUERY REWRITE =========="
  );

  console.log(
    "Original :",
    latestMessage
  );

  console.log(
    "Rewritten:",
    rewrittenQuery
  );

  console.log(
    "===================================\n"
  );

  //------------------------------------------------------
  // Retrieve + Re-rank Knowledge
  //------------------------------------------------------

  const knowledge =
    await retrieveKnowledge(
      rewrittenQuery,
      5
    );

  console.log(
    "\n========== KNOWLEDGE =========="
  );

  console.log(
    "Retrieved:",
    knowledge.length
  );

  knowledge.forEach(
    (item, index) => {
      console.log(
        `Source ${index + 1}`
      );

      console.log(item.content);

      console.log("----------------------");
    }
  );

  console.log(
    "===============================\n"
  );

//------------------------------------------------------
// No Knowledge
//------------------------------------------------------

if (knowledge.length === 0) {

  return "NO_RELEVANT_KNOWLEDGE";

}

  //------------------------------------------------------
  // Build Knowledge Context
  //------------------------------------------------------

  const knowledgeContext =
    knowledge
      .map(
        (item, index) =>
`Source ${index + 1}

${item.content}`
      )
      .join("\n\n");

  //------------------------------------------------------
  // Final Prompt
  //------------------------------------------------------

  const prompt = `
You are a professional AI Call Center Agent.

Answer ONLY using the provided knowledge.

Never invent information.

If the answer isn't found,
reply exactly:

"I couldn't find that information in our knowledge base."

--------------------------------------------------

Conversation Memory

${memory || "None"}

--------------------------------------------------

Knowledge

${knowledgeContext}

--------------------------------------------------

Conversation

${transcript}

--------------------------------------------------

Customer

${latestMessage}

--------------------------------------------------

Assistant
`;

  console.log(
    "\n========== FINAL PROMPT =========="
  );

  console.log(prompt);

  console.log(
    "==================================\n"
  );

  return prompt;
}