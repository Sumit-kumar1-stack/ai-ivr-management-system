import { IVRFlowLifecycle, IVRFlowVersionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type KnowledgeDocumentDependencySummary = {
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

export async function getKnowledgeDocumentDependencySummary(
  documentId: string
): Promise<KnowledgeDocumentDependencySummary> {
  const id = documentId.trim();
  if (!id) {
    return emptySummary();
  }

  const [legacyCampaignCount, communicationCampaigns, flows, versions, inboundProfiles] = await Promise.all([
    prisma.campaignKnowledgeDocument.count({ where: { knowledgeDocumentId: id } }),
    prisma.communicationCampaign.findMany({ select: { knowledgeDocumentIds: true } }),
    prisma.iVRFlow.findMany({ select: { id: true, lifecycle: true, nodes: true } }),
    prisma.iVRFlowVersion.findMany({ select: { id: true, flowId: true, status: true, nodes: true } }),
    prisma.inboundProfile.findMany({ select: { id: true, active: true, ivrFlowId: true, ivrFlowVersionId: true, knowledgeDocumentIds: true } }),
  ]);

  const referencedFlows = flows.filter(flow => graphReferencesKnowledgeDocument(flow.nodes, id));
  const referencedVersions = versions.filter(version => graphReferencesKnowledgeDocument(version.nodes, id));
  const referencedFlowIds = new Set(referencedFlows.map(flow => flow.id));
  const referencedVersionIds = new Set(referencedVersions.map(version => version.id));
  const inboundProfileScopeCount = inboundProfiles.filter(profile => valueReferencesKnowledgeDocument(profile.knowledgeDocumentIds, id)).length;
  const liveDeploymentCount = inboundProfiles.filter(profile =>
    profile.active && (
      valueReferencesKnowledgeDocument(profile.knowledgeDocumentIds, id) ||
      (profile.ivrFlowId !== null && referencedFlowIds.has(profile.ivrFlowId)) ||
      (profile.ivrFlowVersionId !== null && referencedVersionIds.has(profile.ivrFlowVersionId))
    )
  ).length;
  const runtimeCallCount = referencedVersionIds.size
    ? await prisma.call.count({ where: { ivrFlowVersionId: { in: [...referencedVersionIds] } } })
    : 0;
  const campaignCount = legacyCampaignCount + communicationCampaigns.filter(campaign => valueReferencesKnowledgeDocument(campaign.knowledgeDocumentIds, id)).length;
  const publishedIvrVersionCount = referencedVersions.filter(version => version.status === IVRFlowVersionStatus.PUBLISHED).length;
  const ivrFlowCount = referencedFlows.length;
  const hasPublishedFlow = referencedFlows.some(flow => flow.lifecycle === IVRFlowLifecycle.PUBLISHED);
  const ivrVersionCount = referencedVersions.length;
  const isReferenced = Boolean(campaignCount || ivrFlowCount || ivrVersionCount || inboundProfileScopeCount || runtimeCallCount);
  const deleteBlockReason = getDeleteBlockReason({ campaignCount, ivrFlowCount, ivrVersionCount, publishedIvrVersionCount, inboundProfileScopeCount, liveDeploymentCount, runtimeCallCount, isReferenced });

  return {
    campaignCount,
    ivrFlowCount,
    ivrVersionCount,
    publishedIvrVersionCount,
    inboundProfileScopeCount,
    liveDeploymentCount,
    runtimeCallCount,
    isReferenced,
    deleteAllowed: !isReferenced,
    // Metadata changes to evidence used by a published or live IVR are blocked.
    editAllowed: !hasPublishedFlow && publishedIvrVersionCount === 0 && liveDeploymentCount === 0,
    deleteBlockReason,
  };
}

function emptySummary(): KnowledgeDocumentDependencySummary {
  return {
    campaignCount: 0,
    ivrFlowCount: 0,
    ivrVersionCount: 0,
    publishedIvrVersionCount: 0,
    inboundProfileScopeCount: 0,
    liveDeploymentCount: 0,
    runtimeCallCount: 0,
    isReferenced: false,
    deleteAllowed: true,
    editAllowed: true,
    deleteBlockReason: null,
  };
}

function getDeleteBlockReason(summary: Pick<KnowledgeDocumentDependencySummary, "campaignCount" | "ivrFlowCount" | "ivrVersionCount" | "publishedIvrVersionCount" | "inboundProfileScopeCount" | "liveDeploymentCount" | "runtimeCallCount" | "isReferenced">): string | null {
  if (summary.liveDeploymentCount) return "Used by a live inbound flow";
  if (summary.publishedIvrVersionCount) return "Used by a published IVR";
  if (summary.runtimeCallCount) return "Required by retained runtime history";
  if (summary.ivrVersionCount) return "Used by an IVR version";
  if (summary.ivrFlowCount) return "Used by an IVR flow";
  if (summary.inboundProfileScopeCount) return "Used by an inbound profile";
  if (summary.campaignCount) return `Referenced by ${summary.campaignCount} campaign${summary.campaignCount === 1 ? "" : "s"}`;
  return summary.isReferenced ? "Referenced by protected resources" : null;
}

function graphReferencesKnowledgeDocument(value: unknown, documentId: string): boolean {
  return containsKnowledgeReference(value, documentId);
}

function valueReferencesKnowledgeDocument(value: unknown, documentId: string): boolean {
  return toStringArray(value).includes(documentId);
}

function containsKnowledgeReference(value: unknown, documentId: string): boolean {
  if (Array.isArray(value)) return value.some(item => containsKnowledgeReference(item, documentId));
  if (!isRecord(value)) return false;

  for (const [key, nested] of Object.entries(value)) {
    if (["knowledgeDocumentIds", "knowledgeIds", "knowledge"].includes(key) && valueReferencesKnowledgeDocument(nested, documentId)) {
      return true;
    }
    if (containsKnowledgeReference(nested, documentId)) return true;
  }

  return false;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
