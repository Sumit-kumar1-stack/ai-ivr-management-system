import { searchKnowledge } from "./search.service";

export async function buildKnowledgeContext(
  question: string
) {
  const chunks =
    await searchKnowledge(question);

  if (!chunks.length) {
    return "";
  }

  return chunks
    .map((chunk) => chunk.content)
    .join("\n\n");
}