import { askAI } from "@/services/ai/llm.factory";

function isContextDependentOrAmbiguous(history: string, question: string): boolean {
  if (!history || history.trim() === "") {
    return false;
  }

  const words = question.trim().split(/\s+/).filter(Boolean);
  
  // Very short utterances in the middle of a conversation (1-2 words) are context-dependent (e.g. "why?", "how?", "yes", "sure")
  if (words.length <= 2) {
    return true;
  }

  // Long questions are complex follow-up questions and benefit from rewriting
  if (words.length > 5) {
    return true;
  }

  // Words that indicate reference to previous context
  const contextKeywords = new Set([
    "it", "its", "this", "that", "these", "those", "they", "them", "their",
    "he", "him", "his", "she", "her", "hers", "here", "there", "then",
    "yes", "no", "ok", "okay", "yeah", "yep", "yup", "nah", "sure", "correct",
    "right", "wrong", "previous", "last", "above", "mentioned", "earlier", "before",
    "latter", "former", "other", "another", "same", "one", "ones", "much", "many",
    "else", "also", "too", "instead", "except", "about", "more", "so", "then"
  ]);

  const hasContextKeyword = words.some(word => 
    contextKeywords.has(word.toLowerCase().replace(/[^a-z]/g, ""))
  );

  return hasContextKeyword;
}

export async function rewriteQuery(
  history: string,
  question: string
): Promise<string> {
  if (!isContextDependentOrAmbiguous(history, question)) {
    console.log("Skipping query rewriting for standalone question:", question);
    return question.trim();
  }

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