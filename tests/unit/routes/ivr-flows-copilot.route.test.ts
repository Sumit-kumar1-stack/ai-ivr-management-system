import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/app-error";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  resolveIVRBuilderContext: vi.fn(),
  toIVRFlowResourceAuthorization: vi.fn(),
  buildFlowCopilotSuggestion: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth-response", () => ({ createAuthErrorResponse: mocks.createAuthErrorResponse }));
vi.mock("@/services/ivr/ivr-builder-catalog.service", () => ({
  resolveIVRBuilderContext: mocks.resolveIVRBuilderContext,
  toIVRFlowResourceAuthorization: mocks.toIVRFlowResourceAuthorization,
}));
vi.mock("@/services/ivr/flow-copilot.service", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/ivr/flow-copilot.service")>(),
  buildFlowCopilotSuggestion: mocks.buildFlowCopilotSuggestion,
}));

import { POST } from "@/app/api/ivr-flows/copilot/route";

const catalog = {
  supportedNodeKinds: ["START", "END_CALL"], actions: [], transferDestinations: [], knowledgeDocuments: [],
  approvedMessageTemplates: [], inboundProfiles: [], campaigns: [], warnings: [],
};

function request(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/ivr-flows/copilot", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const body = {
  mode: "GENERATE",
  prompt: "Create DemoBank personal loans",
  flowName: "DemoBank",
  inboundProfileId: "cmt7ackwx00043zxkxr3u8zf7",
  currentFlow: { nodes: [{ id: "start" }], edges: [] },
};

describe("IVR Copilot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "admin-1", role: UserRole.ADMIN, tenantId: "tenant-1" });
    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.resolveIVRBuilderContext.mockResolvedValue({ target: { kind: "INBOUND_PROFILE" }, catalog });
    mocks.toIVRFlowResourceAuthorization.mockReturnValue({});
    mocks.buildFlowCopilotSuggestion.mockResolvedValue({
      summary: "DemoBank candidate", warnings: [], assumptions: [], missingResources: [], suggestedTests: [],
      candidateFlow: { nodes: Array.from({ length: 6 }, (_, index) => ({ id: String(index) })), edges: Array.from({ length: 11 }, (_, index) => ({ id: String(index) })) },
      validation: { valid: true, errors: [], warnings: [], issues: [] },
    });
  });

  it("returns a valid DemoBank candidate as HTTP 200", async () => {
    const response = await POST(request(body), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.candidateFlow.nodes).toHaveLength(6);
    expect(payload.data.candidateFlow.edges).toHaveLength(11);
  });

  it("returns deterministic candidate errors in a 200 response", async () => {
    mocks.buildFlowCopilotSuggestion.mockResolvedValueOnce({
      summary: "Candidate needs repair", warnings: [], assumptions: [], missingResources: [], suggestedTests: [],
      candidateFlow: { nodes: [], edges: [] },
      validation: { valid: false, errors: [{ code: "INVALID_NODE_CONFIG" }], warnings: [], issues: [{ code: "INVALID_NODE_CONFIG" }] },
    });

    const response = await POST(request(body), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.validation).toMatchObject({ valid: false, errors: [{ code: "INVALID_NODE_CONFIG" }] });
  });

  it("returns a controlled 422 for an unparseable candidate", async () => {
    mocks.buildFlowCopilotSuggestion.mockRejectedValueOnce(new AppError("Malformed candidate", 422, "COPILOT_MALFORMED_RESPONSE"));

    const response = await POST(request(body), {} as never);
    expect(await response.json()).toMatchObject({ code: "COPILOT_MALFORMED_RESPONSE" });
    expect(response.status).toBe(422);
  });

  it("returns a controlled 422 for a missing required request field", async () => {
    const response = await POST(request({ ...body, prompt: undefined }), {} as never);
    expect(await response.json()).toMatchObject({ code: "COPILOT_INVALID_REQUEST" });
    expect(response.status).toBe(422);
  });

  it("returns 500 for unexpected failures", async () => {
    mocks.buildFlowCopilotSuggestion.mockRejectedValueOnce(new Error("Unexpected failure"));
    const response = await POST(request(body), {} as never);
    expect(response.status).toBe(500);
  });
});
