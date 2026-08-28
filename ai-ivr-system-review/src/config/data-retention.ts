import {
  getIntegerEnv,
} from "@/config/env";

export interface DataRetentionPolicy {
  recordingsDays: number | null;
  transcriptsDays: number | null;
  conversationMetadataDays: number | null;
  auditEventsDays: number | null;
  deletionBatchSize: number;
}

export interface DataRetentionDeletionJob {
  tenantId: string;
  scope: "RECORDINGS" | "TRANSCRIPTS" | "CONVERSATION_METADATA" | "AUDIT_EVENTS";
  before: Date;
  reason: string;
  requestedBy: "SYSTEM" | "ADMIN" | "AUDITOR";
}

const DEFAULT_DELETION_BATCH_SIZE = 500;

function readRetentionDays(name: string): number | null {
  const value = getIntegerEnv(name, -1, -1);
  return value < 0 ? null : value;
}

export function getDataRetentionPolicy(): DataRetentionPolicy {
  return {
    recordingsDays: readRetentionDays("RECORDING_RETENTION_DAYS"),
    transcriptsDays: readRetentionDays("TRANSCRIPT_RETENTION_DAYS"),
    conversationMetadataDays: readRetentionDays("CONVERSATION_METADATA_RETENTION_DAYS"),
    auditEventsDays: readRetentionDays("AUDIT_EVENT_RETENTION_DAYS"),
    deletionBatchSize: getIntegerEnv(
      "RETENTION_DELETION_BATCH_SIZE",
      DEFAULT_DELETION_BATCH_SIZE,
      1
    ),
  };
}
