import {
  NextRequest,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
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
      createApiKeyMaterial:
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
      apiKey: {
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
    createApiKeyMaterial:
      mocks.createApiKeyMaterial,
  })
);

import {
  GET,
  POST,
} from "@/app/api/developer/api-keys/route";

const developerUser = {
  id: "user-1",
  role: UserRole.ADMIN,
  tenantId: "tenant-1",
};

describe("developer API keys route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(developerUser);
    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.extractAuditRequestContext.mockReturnValue({
      ipAddress: "127.0.0.1",
      correlationId: "corr-1",
    });
    mocks.createApiKeyMaterial.mockReturnValue({
      prefix: "ivk_test",
      plaintext: "ivk_test_secret",
      hash: "hash-1",
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.create.mockResolvedValue({
      id: "key-1",
      name: "Integration",
      prefix: "ivk_test",
    });
  });

  it("creates an API key, stores only the hash, and returns the plaintext once", async () => {
    const response = await POST(
      new NextRequest(
        "https://example.com/api/developer/api-keys",
        {
          method: "POST",
          body: JSON.stringify({
            name: "Integration",
            scopes: ["developer:read"],
            expiresAt:
              "2026-08-23T00:00:00.000Z",
          }),
        }
      )
    );

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hash: "hash-1",
          prefix: "ivk_test",
        }),
      })
    );

    const payload = await response.json();
    expect(payload.key.plaintextKey).toBe(
      "ivk_test_secret"
    );
  });

  it("lists only the current tenant keys", async () => {
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

