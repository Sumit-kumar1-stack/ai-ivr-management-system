export type SafeEventSnapshot =
  Record<
    string,
    string | number | boolean | null
  >;

export type SafeAuditSnapshot =
  Record<
    string,
    | string
    | number
    | boolean
    | null
    | Array<string | number | boolean | null>
  >;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasNonEmptyString(
  value: unknown
): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function getStringLength(
  value: unknown
): number {
  return typeof value === "string"
    ? value.length
    : 0;
}

function getPayloadType(
  payload: unknown
): string {
  if (payload === null) {
    return "null";
  }

  if (Array.isArray(payload)) {
    return "array";
  }

  return typeof payload;
}

function hasTimestamp(
  value: unknown
): boolean {
  return (
    value instanceof Date ||
    typeof value === "number" ||
    hasNonEmptyString(value)
  );
}

/**
 * Creates metadata about an event payload without
 * copying caller speech, AI output, phone numbers,
 * provider IDs or other sensitive values.
 */
export function createSafeEventSnapshot(
  payload: unknown
): SafeEventSnapshot {
  const record =
    isRecord(payload)
      ? payload
      : null;

  return {
    payloadPresent:
      payload !== undefined &&
      payload !== null,

    payloadType:
      getPayloadType(payload),

    payloadFieldCount:
      record
        ? Object.keys(record).length
        : 0,

    callIdPresent:
      hasNonEmptyString(
        record?.callId
      ),

    timestampPresent:
      hasTimestamp(
        record?.timestamp
      ),

    metadataPresent:
      record?.metadata !== undefined &&
      record.metadata !== null,

    textPresent:
      hasNonEmptyString(
        record?.text
      ),

    textCharacterCount:
      getStringLength(
        record?.text
      ),

    messagePresent:
      hasNonEmptyString(
        record?.message
      ),

    messageCharacterCount:
      getStringLength(
        record?.message
      ),

    transcriptPresent:
      hasNonEmptyString(
        record?.transcript
      ),

    transcriptCharacterCount:
      getStringLength(
        record?.transcript
      ),

    summaryPresent:
      hasNonEmptyString(
        record?.summary
      ),

    summaryCharacterCount:
      getStringLength(
        record?.summary
      ),

    analysisPresent:
      record?.analysis !== undefined &&
      record.analysis !== null,

    phonePresent:
      hasNonEmptyString(
        record?.phone
      ),

    emailPresent:
      hasNonEmptyString(
        record?.email
      ),

    providerCallIdPresent:
      hasNonEmptyString(
        record?.providerCallId
      ),

    streamSidPresent:
      hasNonEmptyString(
        record?.streamSid
      ),

    binaryPayloadPresent:
      record?.data instanceof
        Uint8Array,
  };
}

const AUDIT_FIELD_ALLOWLIST =
  new Set([
    "callId",
    "tenantId",
    "campaignId",
    "contactId",
    "securitySessionId",
    "correlationId",
    "requestId",
    "actorType",
    "requestedBy",
    "requestedAction",
    "requestedAuthLevel",
    "decision",
    "policyDecision",
    "outcome",
    "intent",
    "status",
    "documentId",
    "documentName",
    "documentStatus",
    "ownerUserId",
    "archivedAt",
    "reason",
    "actionCode",
    "actionType",
    "runtime",
    "requestedRuntime",
    "effectiveRuntime",
    "fallbackUsed",
    "fallbackReason",
    "authenticationLevel",
    "requiredAuthLevel",
    "riskLevel",
    "confidence",
    "enabled",
    "duplicate",
    "executed",
    "matched",
    "turnId",
    "provider",
    "providerCallId",
    "conversationState",
    "classification",
    "queryCharacterCount",
    "scopedDocumentCount",
    "allowedClassificationCount",
    "loadedChunkCount",
    "retrievedChunkCount",
    "documentCount",
    "documentIds",
    "newConversation",
    "existingConversationMessageCount",
    "role",
    "transferStatus",
    "streamSidPresent",
    "twilioCallSidPresent",
    "messageCount",
    "existingConversationMessageCount",
  ]);

function isAuditSafePrimitive(
  value: unknown
): value is
  | string
  | number
  | boolean
  | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isAuditSafeArray(
  value: unknown
): value is Array<
  string | number | boolean | null
> {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        isAuditSafePrimitive(
          item
        )
    )
  );
}

export function createSafeAuditSnapshot(
  payload: unknown
): SafeAuditSnapshot {
  const record =
    isRecord(payload)
      ? payload
      : null;

  const snapshot:
    SafeAuditSnapshot =
    {
      ...createSafeEventSnapshot(
        payload
      ),
    };

  if (
    !record
  ) {
    return snapshot;
  }

  for (
    const key of
    AUDIT_FIELD_ALLOWLIST
  ) {
    const value =
      record[key];

    if (
      isAuditSafePrimitive(
        value
      )
    ) {
      snapshot[key] =
        value;
      continue;
    }

    if (
      isAuditSafeArray(
        value
      )
    ) {
      snapshot[key] =
        value;
    }
  }

  return snapshot;
}
