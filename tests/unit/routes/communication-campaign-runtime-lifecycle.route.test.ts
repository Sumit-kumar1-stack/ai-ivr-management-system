import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  authResponse: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCampaignCapability: mocks.requireCapability,
}));
vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.authResponse,
}));
vi.mock("@/services/communication/communication-campaign-runtime-lifecycle.service", () => ({
  pauseCommunicationCampaign: mocks.pause,
  resumeCommunicationCampaign: mocks.resume,
  cancelCommunicationCampaign: mocks.cancel,
}));

import { POST as pausePost } from "@/app/api/communication/campaigns/[id]/pause/route";
import { POST as resumePost } from "@/app/api/communication/campaigns/[id]/resume/route";
import { POST as cancelPost } from "@/app/api/communication/campaigns/[id]/cancel/route";

const actor = {
  id: "operator-1",
  role: "ADMIN",
  tenantId: "tenant-1",
  campaignCapabilities: ["CAMPAIGN_LAUNCH"],
};
const context = {
  params: Promise.resolve({ id: "campaign-1" }),
};

describe("communication runtime lifecycle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue(actor);
    mocks.authResponse.mockReturnValue(null);
    mocks.pause.mockResolvedValue({ campaignId: "campaign-1", status: "PAUSED" });
    mocks.resume.mockResolvedValue({ campaignId: "campaign-1", status: "RUNNING" });
    mocks.cancel.mockResolvedValue({ campaignId: "campaign-1", status: "CANCELLED" });
  });

  it.each([
    ["pause", pausePost, mocks.pause, "PAUSED"],
    ["resume", resumePost, mocks.resume, "RUNNING"],
    ["cancel", cancelPost, mocks.cancel, "CANCELLED"],
  ] as const)("authorizes and delegates %s to the canonical service", async (action, handler, service, status) => {
    const response = await handler(
      new NextRequest(`https://example.com/api/communication/campaigns/campaign-1/${action}`, { method: "POST" }),
      context
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { status } });
    expect(mocks.requireCapability).toHaveBeenCalledWith("CAMPAIGN_LAUNCH");
    expect(service).toHaveBeenCalledWith("campaign-1", actor);
  });

  it("blocks unauthorized lifecycle actions before calling any service", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("forbidden"));
    mocks.authResponse.mockReturnValue(NextResponse.json({ success: false }, { status: 403 }));
    const response = await pausePost(new NextRequest("https://example.com/pause", { method: "POST" }), context);
    expect(response.status).toBe(403);
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it("maps cross-tenant not-found failures safely", async () => {
    mocks.cancel.mockRejectedValue(new Error("Communication campaign not found"));
    const response = await cancelPost(new NextRequest("https://example.com/cancel", { method: "POST" }), context);
    expect(response.status).toBe(404);
  });

  it("maps invalid transitions to conflict", async () => {
    mocks.resume.mockRejectedValue(new Error("Communication campaign transition COMPLETED -> RUNNING is not allowed"));
    const response = await resumePost(new NextRequest("https://example.com/resume", { method: "POST" }), context);
    expect(response.status).toBe(409);
  });
});
