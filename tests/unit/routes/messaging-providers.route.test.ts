import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getMessagingProviderDescriptors: vi.fn(),
  getPreferredMessagingProvider: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/services/messaging/messaging-provider-registry.service", () => ({
  getMessagingProviderDescriptors: mocks.getMessagingProviderDescriptors,
  getPreferredMessagingProvider: mocks.getPreferredMessagingProvider,
}));

import { GET } from "@/app/api/settings/messaging/providers/route";

describe("GET /api/settings/messaging/providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireRole.mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
    });

    mocks.getMessagingProviderDescriptors.mockReturnValue([
      {
        provider: "TWILIO",
        channel: "SMS",
        label: "Twilio",
        capabilities: ["SMS_OUTBOUND", "SMS_STATUS_CALLBACK"],
        supported: true,
        configured: true,
        enabled: true,
        available: true,
        missingConfigurationKeys: [],
      },
      {
        provider: "PLIVO",
        channel: "SMS",
        label: "Plivo",
        capabilities: ["SMS_OUTBOUND", "SMS_STATUS_CALLBACK"],
        supported: true,
        configured: false,
        enabled: false,
        available: false,
        missingConfigurationKeys: ["PLIVO_SMS_FROM"],
      },
      {
        provider: "EXOTEL",
        channel: "SMS",
        label: "Exotel",
        capabilities: ["SMS_OUTBOUND", "SMS_STATUS_CALLBACK"],
        supported: true,
        configured: false,
        enabled: false,
        available: false,
        missingConfigurationKeys: ["EXOTEL_SMS_FROM", "EXOTEL_ACCOUNT_SID"],
      },
      {
        provider: "META",
        channel: "WHATSAPP",
        label: "Meta WhatsApp",
        capabilities: [
          "WHATSAPP_OUTBOUND",
          "WHATSAPP_TEMPLATE",
          "WHATSAPP_STATUS_CALLBACK",
          "WHATSAPP_READ_RECEIPT",
        ],
        supported: true,
        configured: true,
        enabled: true,
        available: true,
        missingConfigurationKeys: [],
      },
    ]);

    mocks.getPreferredMessagingProvider.mockImplementation((channel: string) => {
      if (channel === "SMS") return "TWILIO";
      if (channel === "WHATSAPP") return "META";
      return null;
    });
  });

  it("returns safe provider descriptors and preferred configuration for ADMIN", async () => {
    const req = new NextRequest("https://example.com/api/settings/messaging/providers");
    const res = await GET(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.providers).toHaveLength(4);
    expect(body.data.preferred).toEqual({
      sms: "TWILIO",
      whatsapp: "META",
    });

    // Verify safe descriptor structure
    const twilio = body.data.providers.find((p: any) => p.provider === "TWILIO");
    expect(twilio).toMatchObject({
      provider: "TWILIO",
      channel: "SMS",
      label: "Twilio",
      configured: true,
      enabled: true,
      available: true,
    });

    const plivo = body.data.providers.find((p: any) => p.provider === "PLIVO");
    expect(plivo).toMatchObject({
      provider: "PLIVO",
      configured: false,
      missingConfigurationKeys: ["PLIVO_SMS_FROM"],
    });
  });

  it("never exposes secret values, credentials, or auth headers in response payload", async () => {
    const req = new NextRequest("https://example.com/api/settings/messaging/providers");
    const res = await GET(req, { params: Promise.resolve({}) });
    const bodyText = await res.text();

    expect(bodyText).not.toContain("AUTH_TOKEN");
    expect(bodyText).not.toContain("API_KEY");
    expect(bodyText).not.toContain("WEBHOOK_SECRET");
    expect(bodyText).not.toContain("Authorization");
    expect(bodyText).not.toContain("password");
  });

  it("rejects unauthorized access when role check throws 403", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Unauthorized"));

    const req = new NextRequest("https://example.com/api/settings/messaging/providers");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(500);
  });
});
