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
  dependencySummary: {
    campaignCount: number;
    ivrFlowCount: number;
    ivrVersionCount: number;
    publishedIvrVersionCount: number;
    inboundProfileScopeCount: number;
    liveDeploymentCount: number;
    runtimeCallCount: number;
    isReferenced: boolean;
    deleteAllowed: boolean;
    editAllowed: boolean;
    deleteBlockReason: string | null;
  };
  campaignNames?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}
