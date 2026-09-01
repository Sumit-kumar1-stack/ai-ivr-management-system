import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import MessagingProviderSettings from "@/components/settings/messaging-provider-settings";
import type { MessagingProviderDescriptor } from "@/services/messaging/messaging.types";

describe("MessagingProviderSettings Component", () => {
  const mockProviders: MessagingProviderDescriptor[] = [
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
  ];

  it("renders all SMS and WhatsApp provider cards with labels and channels", () => {
    const html = renderToStaticMarkup(
      React.createElement(MessagingProviderSettings, {
        initialProviders: mockProviders,
        initialPreferred: { sms: "TWILIO", whatsapp: "META" },
      })
    );

    // Labels
    expect(html).toContain("Twilio");
    expect(html).toContain("Plivo");
    expect(html).toContain("Exotel");
    expect(html).toContain("Meta WhatsApp");

    // Sections
    expect(html).toContain("SMS Providers");
    expect(html).toContain("WhatsApp Providers");
  });

  it("renders status badges for Configured, Active, and Available states", () => {
    const html = renderToStaticMarkup(
      React.createElement(MessagingProviderSettings, {
        initialProviders: mockProviders,
        initialPreferred: { sms: "TWILIO", whatsapp: "META" },
      })
    );

    expect(html).toContain("Configured");
    expect(html).toContain("Not Configured");
    expect(html).toContain("Available");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Active Provider");
  });

  it("displays safe missing configuration keys without exposing credentials", () => {
    const html = renderToStaticMarkup(
      React.createElement(MessagingProviderSettings, {
        initialProviders: mockProviders,
        initialPreferred: { sms: "TWILIO", whatsapp: "META" },
      })
    );

    expect(html).toContain("PLIVO_SMS_FROM");
    expect(html).toContain("EXOTEL_SMS_FROM");
    expect(html).toContain("EXOTEL_ACCOUNT_SID");

    // Zero secret values
    expect(html).not.toContain("AUTH_TOKEN");
    expect(html).not.toContain("API_KEY");
    expect(html).not.toContain("SECRET");
  });

  it("renders preferred deployment routing configuration banner", () => {
    const html = renderToStaticMarkup(
      React.createElement(MessagingProviderSettings, {
        initialProviders: mockProviders,
        initialPreferred: { sms: "EXOTEL", whatsapp: "META" },
      })
    );

    expect(html).toContain("Deployment Routing Preferences");
    expect(html).toContain("Preferred SMS Provider:");
    expect(html).toContain("EXOTEL");
    expect(html).toContain("Preferred WhatsApp Provider:");
    expect(html).toContain("META");
  });
});
