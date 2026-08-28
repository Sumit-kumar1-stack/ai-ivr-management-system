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
}): string[] {
  const profileIds = toStringArray(input.profileKnowledgeDocumentIds);
  if (profileIds.length > 0) return profileIds;

  const tenantId = input.tenantId?.trim() ?? "";
  const version = input.ivrFlowVersion;
  if (!tenantId || !version || version.status !== "PUBLISHED" || version.tenantId?.trim() !== tenantId) return [];

  return [...new Set(nodes(version.nodes).flatMap(node => {
    const kind = stringValue(node.data?.nodeKind)?.toUpperCase();
    return kind === "KNOWLEDGE" || kind === "AI" || kind === "AI_CONVERSATION"
      ? toStringArray(node.data?.knowledgeDocumentIds ?? node.data?.knowledgeIds ?? node.data?.knowledge)
      : [];
  }))];
}

function nodes(value: unknown): Array<{ data?: Record<string, unknown> }> {
  return Array.isArray(value)
    ? value.filter(isRecord).map(node => ({ data: isRecord(node.data) ? node.data : undefined }))
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
