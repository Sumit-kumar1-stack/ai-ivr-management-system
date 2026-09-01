import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assertCallOwnership: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  fetch: vi.fn(),
  getRecordingMediaUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
  isAuthenticationError: (err: unknown) =>
    err instanceof Error && err.message.includes("auth"),
  isAuthorizationError: (err: unknown) =>
    err instanceof Error && err.message.includes("forbidden"),
}));

vi.mock("@/services/security/tenant-access.service", () => ({
  assertCallOwnership: mocks.assertCallOwnership,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      count: mocks.count,
    },
    $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
  },
}));

vi.mock("@/providers/telephony/plivo.provider", () => ({
  PlivoProvider: class {
    getRecordingMediaUrl = mocks.getRecordingMediaUrl;
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
  createCallLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
  createServerLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
  getDurationMs: () => 1,
  normalizeError: (err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  }),
}));

vi.stubGlobal("fetch", mocks.fetch);

import { GET as getRecording } from "@/app/api/calls/[id]/recording/route";
import { GET as getCallDetails } from "@/app/api/calls/[id]/route";
import { GET as listCalls } from "@/app/api/calls/route";

describe("Calls & Recordings API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLIVO_AUTH_ID = "test-auth-id";
    process.env.PLIVO_AUTH_TOKEN = "test-auth-token";

    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: "AGENT",
    });
    mocks.assertCallOwnership.mockResolvedValue(undefined);
  });

  describe("GET /api/calls/[id]/recording", () => {
    it("sets Content-Disposition to attachment when ?download=1", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "call-1",
        provider: "PLIVO",
        providerCallId: "uuid-1",
        recordingId: "rec-1",
        recordingUrl: "plivo-recording:rec-1",
      });

      mocks.getRecordingMediaUrl.mockResolvedValue(
        new URL("https://s3.amazonaws.com/recordings/rec-1.mp3")
      );

      mocks.fetch.mockResolvedValue(
        new Response("audio-stream-bytes", {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "content-length": "18",
          },
        })
      );

      const request = new NextRequest(
        "https://example.com/api/calls/call-1/recording?download=1"
      );
      const response = await getRecording(request, {
        params: Promise.resolve({ id: "call-1" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="call-call-1.mp3"'
      );
      expect(response.headers.get("content-type")).toBe("audio/mpeg");
    });

    it("sets Content-Disposition to inline for normal playback without ?download=1", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "call-1",
        provider: "PLIVO",
        providerCallId: "uuid-1",
        recordingId: "rec-1",
        recordingUrl: "plivo-recording:rec-1",
      });

      mocks.getRecordingMediaUrl.mockResolvedValue(
        new URL("https://s3.amazonaws.com/recordings/rec-1.mp3")
      );

      mocks.fetch.mockResolvedValue(
        new Response("audio-stream-bytes", {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
          },
        })
      );

      const request = new NextRequest(
        "https://example.com/api/calls/call-1/recording"
      );
      const response = await getRecording(request, {
        params: Promise.resolve({ id: "call-1" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(
        'inline; filename="call-call-1.mp3"'
      );
    });

    it("rejects unauthorized requests", async () => {
      mocks.requireRole.mockRejectedValue(new Error("auth error: unauthorized"));

      const request = new NextRequest(
        "https://example.com/api/calls/call-1/recording"
      );
      const response = await getRecording(request, {
        params: Promise.resolve({ id: "call-1" }),
      });

      expect(response.status).toBe(401);
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/calls/[id]", () => {
    it("returns safe recording status and metadata without exposing provider URLs", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "call-1",
        provider: "PLIVO",
        providerCallId: "uuid-1",
        status: "COMPLETED",
        direction: "INBOUND",
        language: "en-IN",
        duration: 45,
        recordingUrl: "plivo-recording:rec-1",
        recordingStatus: "AVAILABLE",
        recordingAvailableAt: new Date("2026-08-30T10:00:00Z"),
        requestedRuntime: "GEMINI_LIVE",
        effectiveRuntime: "GEMINI_LIVE",
        attemptNumber: 1,
        maxAttempts: 3,
        retryAttempts: [],
        retryOfCall: null,
        conversation: null,
        events: [],
        contact: null,
        campaign: null,
        campaignRun: null,
      });

      const request = new NextRequest("https://example.com/api/calls/call-1");
      const response = await getCallDetails(request, {
        params: Promise.resolve({ id: "call-1" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toMatchObject({
        id: "call-1",
        hasRecording: true,
        recordingStatus: "AVAILABLE",
        direction: "INBOUND",
        provider: "PLIVO",
        contact: null,
        campaign: null,
      });
      // Ensure raw recording URL is not leaked
      expect(json.data).not.toHaveProperty("recordingUrl");
    });
  });

  describe("GET /api/calls", () => {
    it("normalizes recording status in call list items", async () => {
      mocks.findMany.mockResolvedValue([
        {
          id: "call-1",
          provider: "PLIVO",
          providerCallId: "uuid-1",
          status: "COMPLETED",
          direction: "OUTBOUND",
          language: "en-IN",
          duration: 30,
          recordingUrl: "plivo-recording:rec-1",
          recordingStatus: "AVAILABLE",
          recordingAvailableAt: new Date("2026-08-30T10:00:00Z"),
          contact: null,
          campaign: null,
          campaignRun: null,
          conversation: null,
          requestedAt: new Date("2026-08-30T09:59:00Z"),
          createdAt: new Date("2026-08-30T09:59:00Z"),
          updatedAt: new Date("2026-08-30T10:00:00Z"),
        },
      ]);
      mocks.count.mockResolvedValue(1);

      const request = new NextRequest(
        "https://example.com/api/calls?hasRecording=true"
      );
      const response = await listCalls(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data[0]).toMatchObject({
        id: "call-1",
        hasRecording: true,
        recordingStatus: "AVAILABLE",
        direction: "OUTBOUND",
        provider: "PLIVO",
      });
      expect(json.data[0]).not.toHaveProperty("recordingUrl");
    });
  });
});
