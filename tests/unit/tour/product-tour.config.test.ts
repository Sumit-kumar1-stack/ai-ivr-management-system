import { describe, expect, it } from "vitest";

import {
  getProductTour,
  PRODUCT_TOURS,
  type ProductTourMode,
} from "@/config/product-tour.config";

describe("Product Tour Configuration", () => {
  const expectedModes: ProductTourMode[] = [
    "FULL_PLATFORM",
    "IVR_BUILDER",
    "INBOUND_VOICE",
    "OUTBOUND_CAMPAIGN",
    "SMS",
    "WHATSAPP",
    "OMNICHANNEL",
    "ANALYTICS",
    "DEMOBANK",
  ];

  it("registers all 9 expected tour modes in the master registry", () => {
    expectedModes.forEach((mode) => {
      const tour = PRODUCT_TOURS[mode];
      expect(tour).toBeDefined();
      expect(tour.mode).toBe(mode);
      expect(tour.title).toBeTruthy();
      expect(tour.description).toBeTruthy();
      expect(tour.sections.length).toBeGreaterThan(0);
    });
  });

  it("provides comprehensive 21 conceptual sections for FULL_PLATFORM tour", () => {
    const tour = getProductTour("FULL_PLATFORM");
    expect(tour.sections.length).toBeGreaterThanOrEqual(20);

    const sectionIds = tour.sections.map((s) => s.id);
    expect(sectionIds).toContain("platform-overview");
    expect(sectionIds).toContain("dashboard");
    expect(sectionIds).toContain("contacts");
    expect(sectionIds).toContain("knowledge");
    expect(sectionIds).toContain("ivr-builder");
    expect(sectionIds).toContain("ivr-validation");
    expect(sectionIds).toContain("inbound-voice-config");
    expect(sectionIds).toContain("inbound-journey");
    expect(sectionIds).toContain("campaign-creation");
    expect(sectionIds).toContain("outbound-voice-campaign");
    expect(sectionIds).toContain("sms-configuration");
    expect(sectionIds).toContain("sms-campaign");
    expect(sectionIds).toContain("whatsapp-configuration");
    expect(sectionIds).toContain("whatsapp-campaign");
    expect(sectionIds).toContain("whatsapp-sms-fallback");
    expect(sectionIds).toContain("voice-to-messaging");
    expect(sectionIds).toContain("governance-maker-checker");
    expect(sectionIds).toContain("calls-recordings");
    expect(sectionIds).toContain("analytics");
    expect(sectionIds).toContain("messaging-provider-settings");
    expect(sectionIds).toContain("developer-integrations");
    expect(sectionIds).toContain("final-architecture");
  });

  it("contains complete 7-step customer loan story in DEMOBANK tour", () => {
    const tour = getProductTour("DEMOBANK");
    expect(tour.sections.length).toBe(7);

    const sectionIds = tour.sections.map((s) => s.id);
    expect(sectionIds).toEqual([
      "demobank-leads",
      "demobank-knowledge",
      "demobank-ivr",
      "demobank-campaign",
      "demobank-governance",
      "demobank-dispatch",
      "demobank-analytics",
    ]);
  });

  it("ensures every step in every tour mode has a valid route, title, description, and target selector", () => {
    expectedModes.forEach((mode) => {
      const tour = getProductTour(mode);
      tour.sections.forEach((section) => {
        expect(section.id).toBeTruthy();
        expect(section.title).toBeTruthy();
        expect(section.steps.length).toBeGreaterThan(0);

        section.steps.forEach((step) => {
          expect(step.id).toBeTruthy();
          expect(step.title).toBeTruthy();
          expect(step.description).toBeTruthy();
          expect(step.route).toMatch(/^\/[a-z0-9\-_/]*$/);
          if (step.target) {
            expect(step.target).toMatch(/^\[data-tour=['"][a-z0-9\-_]+['"]\]$/);
          }
        });
      });
    });
  });

  it("never contains credential values, auth tokens, or passwords in tour definitions", () => {
    const rawConfigString = JSON.stringify(PRODUCT_TOURS);

    expect(rawConfigString).not.toContain("TWILIO_AUTH_TOKEN");
    expect(rawConfigString).not.toContain("PLIVO_AUTH_TOKEN");
    expect(rawConfigString).not.toContain("EXOTEL_API_TOKEN");
    expect(rawConfigString).not.toContain("META_ACCESS_TOKEN");
    expect(rawConfigString).not.toContain("API_KEY=");
    expect(rawConfigString).not.toContain("WEBHOOK_SECRET");
    expect(rawConfigString).not.toContain("Bearer ");
  });
});
