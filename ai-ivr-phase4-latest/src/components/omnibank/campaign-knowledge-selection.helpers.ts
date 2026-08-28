import type { KnowledgeDocumentSummary } from "@/features/knowledge/knowledge.types";

export function isKnowledgeDocumentSelectable(
  document: KnowledgeDocumentSummary,
  selectedKnowledgeDocumentIds: string[]
): boolean {
  return (
    document.status === "ACTIVE" &&
    document.isIndexed
  ) ||
    selectedKnowledgeDocumentIds.includes(
      document.id
    );
}

export function filterSelectableKnowledgeDocuments(
  documents: KnowledgeDocumentSummary[],
  selectedKnowledgeDocumentIds: string[]
): KnowledgeDocumentSummary[] {
  return documents.filter(
    document =>
      isKnowledgeDocumentSelectable(
        document,
        selectedKnowledgeDocumentIds
      )
  );
}

