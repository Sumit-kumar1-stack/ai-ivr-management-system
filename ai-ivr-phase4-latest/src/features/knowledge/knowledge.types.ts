export interface KnowledgeDocumentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  classification: string;
  status: "ACTIVE" | "ARCHIVED";
  uploadedAt: string;
  archivedAt: string | null;
  chunkCount: number;
  campaignCount: number;
  isIndexed: boolean;
  campaignNames?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}
