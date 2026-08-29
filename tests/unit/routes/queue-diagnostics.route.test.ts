import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  getQueueDiagnostics: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.createAuthErrorResponse,
}));

vi.mock("@/services/queues/queue-diagnostics.service", () => ({
  getQueueDiagnostics: mocks.getQueueDiagnostics,
}));

import { GET } from "@/app/api/internal/queue-diagnostics/route";

const queueResponse = [
  {
    name: "campaign-processing",
    counts: { waiting: 1, active: 2, delayed: 3, prioritized: 4 },
  },
];

describe("queue diagnostics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ role: UserRole.SUPER_ADMIN });
    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.getQueueDiagnostics.mockResolvedValue(queueResponse);
  });

  it("allows only SUPER_ADMIN and returns counts", async () => {
    const response = await GET();

    expect(mocks.requireRole).toHaveBeenCalledWith([
      UserRole.SUPER_ADMIN,
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queues: queueResponse });
  });

  it.each([
    ["unauthenticated", 401],
    ["unauthorized", 403],
  ])("does not query queues when %s", async (_case, status) => {
    const authResponse = NextResponse.json(
      { success: false },
      { status }
    );
    const error = new Error("denied");

    mocks.requireRole.mockRejectedValue(error);
    mocks.createAuthErrorResponse.mockReturnValue(authResponse);

    const response = await GET();

    expect(response.status).toBe(status);
    expect(mocks.getQueueDiagnostics).not.toHaveBeenCalled();
  });
});
