import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { GET, POST } from "@/app/api/developer/integrations/route";
import { clearIntegrationRegistry } from "@/services/integrations/integration-action-gateway.service";

const mockRequireRole = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

describe("Developer Integrations Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIntegrationRegistry();
    mockRequireRole.mockResolvedValue({
      id: "user-admin",
      role: UserRole.ADMIN,
      tenantId: "tenant-alpha",
    });
  });

  it("registers a valid external integration endpoint", async () => {
    const req = new NextRequest("http://localhost/api/developer/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Order Service",
        actionCode: "GET_ORDER",
        endpointUrl: "https://api.alpha-corp.com/orders",
        timeoutMs: 4000,
        requiredAuthLevel: "AUTH_LEVEL_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.actionCode).toBe("GET_ORDER");
    expect(json.data.tenantId).toBe("tenant-alpha");
  });

  it("rejects SSRF endpoint attempt to private IP", async () => {
    const req = new NextRequest("http://localhost/api/developer/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Internal Attack",
        actionCode: "ATTACK",
        endpointUrl: "https://169.254.169.254/latest/meta-data",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("lists registered endpoints for the authenticated tenant", async () => {
    // First register
    const postReq = new NextRequest("http://localhost/api/developer/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "CRM Lookup",
        actionCode: "CRM_QUERY",
        endpointUrl: "https://crm.alpha-corp.com/api",
      }),
    });
    await POST(postReq);

    // Then list
    const getReq = new NextRequest("http://localhost/api/developer/integrations", {
      method: "GET",
    });
    const res = await GET(getReq);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].actionCode).toBe("CRM_QUERY");
  });
});
