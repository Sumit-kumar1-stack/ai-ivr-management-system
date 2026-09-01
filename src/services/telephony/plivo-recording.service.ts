import { prisma } from "@/lib/prisma";
import { createCallLogger, normalizeError } from "@/lib/logger";
import { PlivoProvider } from "@/providers/telephony/plivo.provider";

export type RecordingStatus =
  | "NOT_STARTED"
  | "REQUESTED"
  | "STARTED"
  | "AVAILABLE"
  | "FAILED";

/**
 * Normalizes DB recordingStatus and recordingUrl into a safe UI/API recording status.
 */
export function normalizeRecordingStatus(
  status: string | null | undefined,
  hasRecording: boolean
): RecordingStatus {
  if (status === "AVAILABLE" || hasRecording) return "AVAILABLE";
  if (status === "REQUESTED") return "REQUESTED";
  if (status === "STARTED") return "STARTED";
  if (status === "FAILED") return "FAILED";
  return "NOT_STARTED";
}

/**
 * Idempotently and atomically requests Plivo recording for an active inbound or outbound call.
 *
 * DB Lifecycle:
 *   null -> REQUESTED -> STARTED -> (AVAILABLE via callback)
 * Failure:
 *   REQUESTED -> FAILED
 *
 * Recording failure MUST NOT throw or terminate the voice call.
 */
export async function startPlivoRecordingIfNeeded(
  callId: string,
  providerCallId: string
): Promise<boolean> {
  const normalizedCallId = callId.trim();
  const normalizedProviderCallId = providerCallId.trim();

  if (!normalizedCallId || !normalizedProviderCallId) {
    return false;
  }

  // Atomic DB guard: only one attempt can claim the transition from null to REQUESTED
  const claimed = await prisma.call.updateMany({
    where: {
      id: normalizedCallId,
      provider: "PLIVO",
      recordingStatus: null,
    },
    data: {
      recordingStatus: "REQUESTED",
    },
  });

  if (claimed.count === 0) {
    return false;
  }

  try {
    const plivoProvider = new PlivoProvider();
    await plivoProvider.startRecording(normalizedCallId, normalizedProviderCallId);

    await prisma.call.updateMany({
      where: {
        id: normalizedCallId,
        provider: "PLIVO",
        recordingStatus: "REQUESTED",
      },
      data: {
        recordingStatus: "STARTED",
      },
    });

    return true;
  } catch (error) {
    await prisma.call.updateMany({
      where: {
        id: normalizedCallId,
        provider: "PLIVO",
        recordingStatus: "REQUESTED",
      },
      data: {
        recordingStatus: "FAILED",
      },
    });

    const log = createCallLogger(normalizedCallId);
    log.error(
      {
        event: "plivo.recording.start_failed",
        providerCallId: normalizedProviderCallId,
        error: normalizeError(error),
        durationMs: 0,
      },
      "Plivo recording start request failed"
    );

    // Recording failure must never kill the active voice call
    return false;
  }
}
