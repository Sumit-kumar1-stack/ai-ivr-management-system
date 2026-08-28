import { describe, expect, it } from "vitest";

import {
  filterSelectableKnowledgeDocuments,
  isKnowledgeDocumentSelectable,
} from "@/components/omnibank/campaign-knowledge-selection.helpers";

describe("campaign knowledge selection helpers", () => {
  const activeIndexed = {
    id: "doc-active",
    originalName: "Active Doc.pdf",
    mimeType: "application/pdf",
    size: 100,
    path: "/uploads/active.pdf",
    classification: "INTERNAL",
    status: "ACTIVE",
    uploadedAt: new Date().toISOString(),
    archivedAt: null,
    chunkCount: 12,
    campaignCount: 2,
    isIndexed: true,
  } as const;

  const archivedSelected = {
    ...activeIndexed,
    id: "doc-archived",
    status: "ARCHIVED",
    isIndexed: true,
  } as const;

  const archivedUnselected = {
    ...activeIndexed,
    id: "doc-archived-new",
    status: "ARCHIVED",
    isIndexed: true,
  } as const;

  it("allows active indexed documents and previously selected archived documents", () => {
    expect(isKnowledgeDocumentSelectable(activeIndexed as never, [])).toBe(true);
    expect(isKnowledgeDocumentSelectable(archivedSelected as never, ["doc-archived"])).toBe(true);
    expect(isKnowledgeDocumentSelectable(archivedUnselected as never, [])).toBe(false);
  });

  it("filters the selectable campaign knowledge list", () => {
    const documents = [
      activeIndexed,
      archivedSelected,
      archivedUnselected,
    ] as never[];

    const filtered = filterSelectableKnowledgeDocuments(
      documents,
      ["doc-archived"]
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map(document => document.id)).toEqual([
      "doc-active",
      "doc-archived",
    ]);
  });
});

