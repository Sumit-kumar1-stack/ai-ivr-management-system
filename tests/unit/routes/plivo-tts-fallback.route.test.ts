import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  NextRequest,
} from "next/server";

const mocks = vi.hoisted(() => ({
  validateWebhook: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook:
    mocks.validateWebhook,
  createPlivoAuthErrorResponse:
    (error: unknown) =>
      error instanceof Error &&
      error.message === "unsigned"
        ? new Response(null, {
            status: 403,
          })
        : null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/providers/telephony/plivo.provider", () => ({
  normalizePlivoInboundPayload:
    (payload: Record<string, unknown>) => ({
      providerCallId:
        payload.CallUUID ?? null,
    }),
}));

import {
  POST,
} from "@/app/api/plivo/tts-fallback/route";

function request(): NextRequest {
  return new NextRequest(
    "https://voice.example.test/api/plivo/tts-fallback?callId=call-1",
    { method: "POST" }
  );
}

describe("Plivo Standard TTS fallback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateWebhook.mockResolvedValue({
      CallUUID: "plivo-call-uuid",
    });
    mocks.findFirst.mockResolvedValue({
      id: "call-1",
    });
  });

  it("returns static Speak and Hangup XML for the canonical Plivo call", async () => {
    const response =
      await POST(request());
    const body =
      await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type"))
      .toContain("application/xml");
    expect(body)
      .toContain("<Speak>");
    expect(body)
      .toContain("technical difficulties");
    expect(body)
      .toContain("<Hangup/>");
    expect(mocks.findFirst)
      .toHaveBeenCalledWith({
        where: {
          id: "call-1",
          provider: "PLIVO",
          providerCallId:
            "plivo-call-uuid",
        },
        select: {
          id: true,
        },
      });
  });

  it("fails closed when the signed callback belongs to another call", async () => {
    mocks.findFirst.mockResolvedValue(
      null
    );

    const response =
      await POST(request());

    expect(response.status).toBe(403);
    await expect(response.text())
      .resolves.toContain(
        "<Response><Hangup/></Response>"
      );
  });

  it("rejects an unsigned callback without exposing the safe message", async () => {
    mocks.validateWebhook.mockRejectedValue(
      new Error("unsigned")
    );

    const response =
      await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.findFirst)
      .not.toHaveBeenCalled();
  });
});
