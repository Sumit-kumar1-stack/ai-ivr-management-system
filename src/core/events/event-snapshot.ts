export type SafeEventSnapshot =
  Record<
    string,
    string | number | boolean | null
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