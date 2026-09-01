type PublishedInboundIvrVersion = {
  tenantId: string | null;
  status: string;
  nodes: unknown;
} | null | undefined;

/**
 * Resolves the inbound allowlist. The profile remains authoritative when it
 * declares documents; otherwise a tenant-matched published IVR supplies the
 * bindings that were approved with that deployed call flow.
 */
export function resolveInboundKnowledgeDocumentIds(input: {
  tenantId: string | null | undefined;
  profileKnowledgeDocumentIds: unknown;
  ivrFlowVersion: PublishedInboundIvrVersion;
  currentNodeId?: string | null;
}): string[] {
  const profileIds = toStringArray(input.profileKnowledgeDocumentIds);
  const tenantId = input.tenantId?.trim() ?? "";
  const version = input.ivrFlowVersion;
  const isTenantMatch = Boolean(
    tenantId &&
    version &&
    version.status === "PUBLISHED" &&
    version.tenantId?.trim() === tenantId
  );

  const authorizedIds =
    profileIds.length > 0
      ? profileIds
      : isTenantMatch
      ? [
          ...new Set(
            nodes(version?.nodes).flatMap(node => {
              const kind = stringValue(node.data?.nodeKind)?.toUpperCase();
              return kind === "KNOWLEDGE" || kind === "AI" || kind === "AI_CONVERSATION"
                ? toStringArray(
                    node.data?.knowledgeDocumentIds ??
                      node.data?.knowledgeIds ??
                      node.data?.knowledge
                  )
                : [];
            })
          ),
        ]
      : [];

  if (input.currentNodeId && isTenantMatch) {
    const allNodes = nodes(version?.nodes);
    const activeNode = allNodes.find(node => node.id === input.currentNodeId);
    if (activeNode && stringValue(activeNode.data?.nodeKind)?.toUpperCase() === "KNOWLEDGE") {
      const nodeDocs = toStringArray(
        activeNode.data?.knowledgeDocumentIds ??
          activeNode.data?.knowledgeIds ??
          activeNode.data?.knowledge
      );
      return nodeDocs.filter(id => authorizedIds.includes(id));
    }
  }

  return authorizedIds;
}

function nodes(value: unknown): Array<{ id?: string; data?: Record<string, unknown> }> {
  return Array.isArray(value)
    ? value.filter(isRecord).map(node => ({
        id: stringValue(node.id) ?? undefined,
        data: isRecord(node.data) ? node.data : undefined,
      }))
    : [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => typeof item === "string" ? item.trim() : isRecord(item) && typeof item.id === "string" ? item.id.trim() : "").filter(Boolean)
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
