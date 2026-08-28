import {
  NextRequest,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      requireRole:
        vi.fn(),
      createAuthErrorResponse:
        vi.fn(),
      findMany:
        vi.fn(),
      create:
        vi.fn(),
      recordAuditEvent:
        vi.fn(),
      extractAuditRequestContext:
        vi.fn(),
      createWebhookSecretMaterial:
        vi.fn(),
      isSafeWebhookUrl:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/auth",
  () => ({
    requireRole:
      mocks.requireRole,
  })
);

vi.mock(
  "@/lib/auth-response",
  () => ({
    createAuthErrorResponse:
      mocks.createAuthErrorResponse,
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      webhookEndpoint: {
        findMany:
          mocks.findMany,
        create:
          mocks.create,
      },
    },
  })
);

vi.mock(
  "@/services/audit/audit-event.service",
  () => ({
    recordAuditEvent:
      mocks.recordAuditEvent,
  })
);

vi.mock(
  "@/services/audit/audit-context",
  () => ({
    extractAuditRequestContext:
      mocks.extractAuditRequestContext,
  })
);

vi.mock(
  "@/services/developer/developer-security.service",
  () => ({
    createWebhookSecretMaterial:
      mocks.createWebhookSecretMaterial,
    isSafeWebhookUrl:
      mocks.isSafeWebhookUrl,
  })
);

import {
  GET,
  POST,
} from "@/app/api/developer/webhooks/route";

const developerUser = {
  id: "user-1",
  role: UserRole.ADMIN,
  tenantId: "tenant-1",
};

describe("developer webhooks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(developerUser);
    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.extractAuditRequestContext.mockReturnValue({
      ipAddress: "127.0.0.1",
      correlationId: "corr-1",
    });
    mocks.createWebhookSecretMaterial.mockReturnValue({
      prefix: "whsec_test",
      plaintext: "whsec_test_secret",
      hash: "hash-1",
    });
    mocks.isSafeWebhookUrl.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.create.mockResolvedValue({
      id: "webhook-1",
      name: "CRM",
      url: "https://integration.example.com/webhook",
      description: null,
      secretPrefix: "whsec_test",
    });
  });

  it("rejects private or insecure webhook URLs", async () => {
    mocks.isSafeWebhookUrl.mockReturnValue(false);

    const response = await POST(
      new NextRequest(
        "https://example.com/api/developer/webhooks",
        {
          method: "POST",
          body: JSON.stringify({
            name: "CRM",
            url: "http://localhost/webhook",
            events: ["CAMPAIGN_CREATED"],
          }),
        }
      )
    );

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a webhook with a hashed secret and returns the plaintext once", async () => {
    const response = await POST(
      new NextRequest(
        "https://example.com/api/developer/webhooks",
        {
          method: "POST",
          body: JSON.stringify({
            name: "CRM",
            url: "https://integration.example.com/webhook",
            events: ["CAMPAIGN_CREATED"],
          }),
        }
      )
    );

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secretHash: "hash-1",
          secretPrefix: "whsec_test",
        }),
      })
    );

    const payload = await response.json();
    expect(payload.webhook.plaintextSecret).toBe(
      "whsec_test_secret"
    );
  });

  it("lists only the current tenant webhooks", async () => {
    await GET();

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
        },
      })
    );
  });
});
