import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  startRecording: vi.fn(),
  callLoggerError: vi.fn(),
  callLoggerInfo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/providers/telephony/plivo.provider", () => ({
  PlivoProvider: class {
    startRecording = mocks.startRecording;
  },
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: () => ({
    error: mocks.callLoggerError,
    info: mocks.callLoggerInfo,
  }),
  normalizeError: (err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  }),
}));

import {
  normalizeRecordingStatus,
  startPlivoRecordingIfNeeded,
} from "@/services/telephony/plivo-recording.service";

describe("Plivo Recording Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeRecordingStatus", () => {
    it("returns AVAILABLE when status is AVAILABLE or hasRecording is true", () => {
      expect(normalizeRecordingStatus("AVAILABLE", false)).toBe("AVAILABLE");
      expect(normalizeRecordingStatus(null, true)).toBe("AVAILABLE");
      expect(normalizeRecordingStatus(undefined, true)).toBe("AVAILABLE");
      expect(normalizeRecordingStatus("STARTED", true)).toBe("AVAILABLE");
    });

    it("returns REQUESTED when recording was claimed", () => {
      expect(normalizeRecordingStatus("REQUESTED", false)).toBe("REQUESTED");
    });

    it("returns STARTED when recording was initiated with Plivo", () => {
      expect(normalizeRecordingStatus("STARTED", false)).toBe("STARTED");
    });

    it("returns FAILED when recording start failed", () => {
      expect(normalizeRecordingStatus("FAILED", false)).toBe("FAILED");
    });

    it("returns NOT_STARTED when recordingStatus is null/empty and hasRecording is false", () => {
      expect(normalizeRecordingStatus(null, false)).toBe("NOT_STARTED");
      expect(normalizeRecordingStatus(undefined, false)).toBe("NOT_STARTED");
      expect(normalizeRecordingStatus("", false)).toBe("NOT_STARTED");
      expect(normalizeRecordingStatus("UNKNOWN", false)).toBe("NOT_STARTED");
    });
  });

  describe("startPlivoRecordingIfNeeded", () => {
    it("starts recording once on null recordingStatus and transitions to STARTED", async () => {
      mocks.updateMany
        .mockResolvedValueOnce({ count: 1 }) // atomic claim null -> REQUESTED
        .mockResolvedValueOnce({ count: 1 }); // REQUESTED -> STARTED
      mocks.startRecording.mockResolvedValueOnce(undefined);

      const result = await startPlivoRecordingIfNeeded("call-1", "uuid-1");

      expect(result).toBe(true);
      expect(mocks.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: "call-1", provider: "PLIVO", recordingStatus: null },
          data: { recordingStatus: "REQUESTED" },
        })
      );
      expect(mocks.startRecording).toHaveBeenCalledWith("call-1", "uuid-1");
      expect(mocks.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: "call-1", provider: "PLIVO", recordingStatus: "REQUESTED" },
          data: { recordingStatus: "STARTED" },
        })
      );
    });

    it("is idempotent and does not start recording if already claimed or started", async () => {
      mocks.updateMany.mockResolvedValueOnce({ count: 0 }); // claim failed (already claimed/started)

      const result = await startPlivoRecordingIfNeeded("call-1", "uuid-1");

      expect(result).toBe(false);
      expect(mocks.startRecording).not.toHaveBeenCalled();
    });

    it("handles PlivoProvider failure gracefully without throwing and marks status FAILED", async () => {
      mocks.updateMany
        .mockResolvedValueOnce({ count: 1 }) // atomic claim
        .mockResolvedValueOnce({ count: 1 }); // REQUESTED -> FAILED
      mocks.startRecording.mockRejectedValueOnce(new Error("Plivo API error 500"));

      const result = await startPlivoRecordingIfNeeded("call-1", "uuid-1");

      // Returns false without throwing, allowing voice call to continue safely
      expect(result).toBe(false);
      expect(mocks.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: "call-1", provider: "PLIVO", recordingStatus: "REQUESTED" },
          data: { recordingStatus: "FAILED" },
        })
      );
      expect(mocks.callLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "plivo.recording.start_failed",
          providerCallId: "uuid-1",
        }),
        expect.any(String)
      );
    });

    it("returns false for empty callId or providerCallId", async () => {
      expect(await startPlivoRecordingIfNeeded("", "uuid-1")).toBe(false);
      expect(await startPlivoRecordingIfNeeded("call-1", "   ")).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });
  });
});
