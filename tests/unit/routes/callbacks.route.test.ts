import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole, isAuthenticationError: (error: unknown) => error instanceof Error && error.name === "AuthenticationError", isAuthorizationError: (error: unknown) => error instanceof Error && error.name === "AuthorizationError" }));
vi.mock("@/services/telephony/callback-request.service", () => ({ listTenantCallbacks: mocks.list, getTenantCallback: mocks.get, updateCallbackLifecycle: mocks.update }));

import { GET as list } from "@/app/api/callbacks/route";
import { GET as get, POST } from "@/app/api/callbacks/[id]/route";

const callback = { id: "callback-a", tenantId: "tenant-a", originalCallId: "call-a", callId: "call-a", contactId: "contact-a", phone: "+14155550123", scheduledFor: new Date("2026-08-30T10:00:00Z"), preferredEnd: null, timezone: "UTC", reason: "Need help", intent: null, handoffSummary: "PIN: 1234", status: "PENDING", createdAt: new Date(), updatedAt: new Date(), claimedAt: null, completedAt: null, failureReason: null };

describe("callback HTTP authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireRole.mockResolvedValue({ role: UserRole.ADMIN, tenantId: "tenant-a" }); mocks.list.mockResolvedValue([callback]); mocks.get.mockResolvedValue(callback); mocks.update.mockResolvedValue({ ...callback, status: "CONFIRMED" }); });
  it("lists only the authenticated tenant and masks response data", async () => {
    const response = await list(new NextRequest("http://local/api/callbacks"));
    const body = await response.json();
    expect(response.status).toBe(200); expect(mocks.list).toHaveBeenCalledWith("tenant-a"); expect(body.data[0].phone).toContain("••••"); expect(body.data[0].handoffSummary).toBe("PIN: [REDACTED]");
  });
  it("does not let a tenant override its scope or read another callback", async () => {
    expect((await list(new NextRequest("http://local/api/callbacks?tenantId=tenant-b"))).status).toBe(403);
    mocks.get.mockResolvedValue(null);
    expect((await get(new NextRequest("http://local/api/callbacks/callback-b"), { params: Promise.resolve({ id: "callback-b" }) })).status).toBe(404);
  });
  it("allows explicit admin confirmation but rejects unauthorized mutations", async () => {
    const response = await POST(new NextRequest("http://local/api/callbacks/callback-a", { method: "POST", body: JSON.stringify({ action: "confirm" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "callback-a" }) });
    expect(response.status).toBe(200); expect(mocks.update).toHaveBeenCalledWith("tenant-a", "callback-a", "confirm", undefined);
    mocks.requireRole.mockRejectedValue(Object.assign(new Error("no"), { name: "AuthorizationError" }));
    expect((await POST(new NextRequest("http://local/api/callbacks/callback-a", { method: "POST", body: JSON.stringify({ action: "claim" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "callback-a" }) })).status).toBe(403);
  });
});
