import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/app-error";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assertIvrFlowOwnership: vi.fn(),
  findById: vi.fn(),
  simulateIVRFlow: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/services/security/tenant-access.service", () => ({
  assertIvrFlowOwnership: mocks.assertIvrFlowOwnership,
}));

vi.mock("@/services/ivr-flow.service", () => ({
  IVRFlowService: {
    findById: mocks.findById,
  },
}));

vi.mock("@/services/ivr/ivr-simulator.service", () => ({
  simulateIVRFlow: mocks.simulateIVRFlow,
}));

vi.mock("@/services/audit/audit-event.service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { POST } from "@/app/api/ivr-flows/[id]/simulate/route";

const validFlow = {
  id: "flow-a",
  tenantId: "tenant-a",
  nodes: [
    { id: "start", data: { nodeKind: "START" } },
    {
      id: "menu",
      data: {
        nodeKind: "HYBRID_MENU",
        prompt: "Press 1 for support.",
        options: [
          { digit: "1", label: "Support", destinationNodeId: "end" },
        ],
      },
    },
    { id: "end", data: { nodeKind: "END_CALL" } },
  ],
  edges: [
    { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
    { source: "menu", target: "end", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
  ],
};

const invalidFlow = {
  id: "flow-a",
  tenantId: "tenant-a",
  nodes: [
    {
      id: "menu",
      data: {
        nodeKind: "HYBRID_MENU",
        prompt: "Press 1 for support.",
        options: [
          { digit: "1", label: "Support", destinationNodeId: "end" },
        ],
      },
    },
  ],
  edges: [
    { source: "menu", target: "end", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
  ],
};

function request(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/ivr-flows/flow-a/simulate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("IVR flow simulate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
    });
    mocks.assertIvrFlowOwnership.mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue(validFlow);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.simulateIVRFlow.mockImplementation(({ currentNodeId, startNodeId, inputMode, input }) => ({
      validation: { valid: true, errors: [], warnings: [], issues: [] },
      currentNodeId: currentNodeId ?? startNodeId ?? null,
      matchedOption: inputMode === "DTMF" ? input || null : null,
      confidence: 1,
      transition: inputMode,
      resultingNodeId: "menu",
      actionWouldExecute: null,
      responsePreview: null,
      knowledgeScopeSummary: null,
      warnings: [],
      trace: [],
    }));
  });

  it("returns the legacy simulation result payload when no scenario is supplied", async () => {
    const response = await POST(
      request({
        currentNodeId: "start",
        inputMode: "DTMF",
        input: "1",
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.resultingNodeId).toBe("menu");
    expect(mocks.simulateIVRFlow).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "ivr.builder.simulated",
      metadata: expect.objectContaining({
        mode: "LEGACY",
        nodeCount: 3,
        edgeCount: 2,
      }),
    }));
    expect(mocks.simulateIVRFlow).toHaveBeenCalledWith(expect.objectContaining({
      nodes: validFlow.nodes,
      edges: validFlow.edges,
      currentNodeId: "start",
      startNodeId: null,
      inputMode: "DTMF",
      input: "1",
      tenantId: "tenant-a",
    }));
  });

  it("returns a scenario result when a valid scenario payload is supplied", async () => {
    const response = await POST(
      request({
        scenario: {
          name: "Support journey",
          description: "A simple guided call",
          steps: [
            {
              id: "step-1",
              dtmfInput: "1",
            },
          ],
        },
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe("PASS");
    expect(payload.data.steps).toHaveLength(1);
    expect(mocks.simulateIVRFlow).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "ivr.builder.simulated",
      metadata: expect.objectContaining({
        mode: "SCENARIO",
        blocked: false,
        status: "PASS",
        stepCount: 1,
      }),
    }));
  });

  it("rejects malformed scenario payloads", async () => {
    const response = await POST(
      request({
        scenario: {
          name: "Broken scenario",
        },
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("IVR_SIMULATION_INVALID_SCENARIO");
    expect(mocks.simulateIVRFlow).not.toHaveBeenCalled();
  });

  it("rejects unauthorized access before loading the flow", async () => {
    mocks.requireRole.mockRejectedValueOnce(new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED"));

    const response = await POST(
      request({
        currentNodeId: "start",
        inputMode: "DTMF",
        input: "1",
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.assertIvrFlowOwnership).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant flows before loading the flow", async () => {
    mocks.assertIvrFlowOwnership.mockRejectedValueOnce(new AppError("Forbidden", 403, "FORBIDDEN"));

    const response = await POST(
      request({
        currentNodeId: "start",
        inputMode: "DTMF",
        input: "1",
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("blocks invalid flow validation without calling the simulator engine", async () => {
    mocks.findById.mockResolvedValueOnce(invalidFlow);

    const response = await POST(
      request({
        scenario: {
          name: "Broken graph",
          steps: [{ id: "step-1", dtmfInput: "1" }],
        },
      }),
      { params: Promise.resolve({ id: "flow-a" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.blocked).toBe(true);
    expect(payload.data.status).toBe("INCOMPLETE");
    expect(mocks.simulateIVRFlow).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "ivr.builder.simulated",
      metadata: expect.objectContaining({
        mode: "SCENARIO",
        blocked: true,
        status: "INCOMPLETE",
      }),
    }));
  });
});
