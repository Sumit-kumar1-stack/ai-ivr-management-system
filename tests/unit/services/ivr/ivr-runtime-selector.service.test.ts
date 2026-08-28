import { describe, expect, it } from "vitest";

import { selectRuntime } from "@/services/ivr/ivr-runtime-selector.service";

const informationalFlow = {
  id: "flow-1",
  versionId: "version-1",
  runtimeMode: "AUTO" as const,
  runtimeDefault: "STANDARD" as const,
  nodes: [
    { id: "start", data: { nodeKind: "START", label: "FAQ", description: "Information flow" } },
    { id: "end", data: { nodeKind: "END_CALL" } },
  ],
};

describe("ivr runtime selector", () => {
  it("keeps explicit Standard selection", () => {
    const result = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "TWILIO",
      flow: { ...informationalFlow, runtimeMode: "STANDARD" },
    });

    expect(result).toMatchObject({
      selectedRuntime: "STANDARD",
      reasonCode: "EXPLICIT_STANDARD",
    });
    expect(result.reasonText).toBeTruthy();
  });

  it("keeps explicit Premium selection when entitled", () => {
    const result = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "TWILIO",
      flow: { ...informationalFlow, runtimeMode: "PREMIUM" },
    });

    expect(result).toMatchObject({
      selectedRuntime: "PREMIUM",
      reasonCode: "EXPLICIT_PREMIUM",
    });
    expect(result.reasonText).toBeTruthy();
  });

  it("resolves AUTO informational flows to Standard", () => {
    const result = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "TWILIO",
      flow: informationalFlow,
      policy: { defaultRuntime: "STANDARD" },
    });

    expect(result).toMatchObject({
      selectedRuntime: "STANDARD",
      reasonCode: "AUTO_INFORMATIONAL_USE_CASE",
    });
  });

  it("resolves AUTO high-complexity flows to Premium", () => {
    const result = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "TWILIO",
      flow: {
        ...informationalFlow,
        nodes: [
          { id: "start", data: { nodeKind: "START", label: "Assist" } },
          { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
          { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
          { id: "action", data: { nodeKind: "ACTION" } },
          { id: "transfer", data: { nodeKind: "HUMAN_TRANSFER" } },
          { id: "end", data: { nodeKind: "END_CALL" } },
          { id: "extra", data: { nodeKind: "CONDITION" } },
          { id: "extra-2", data: { nodeKind: "BUSINESS_HOURS" } },
        ],
      },
      policy: { defaultRuntime: "STANDARD" },
    });

    expect(result).toMatchObject({
      selectedRuntime: "PREMIUM",
      reasonCode: "AUTO_HIGH_COMPLEXITY",
    });
  });

  it("falls back to Standard when Premium is not entitled", () => {
    const result = selectRuntime({
      tenant: { premiumVoiceEnabled: false },
      provider: "TWILIO",
      flow: { ...informationalFlow, runtimeMode: "AUTO" },
      policy: { explicitPremiumRequired: true, defaultRuntime: "STANDARD" },
    });

    expect(result.selectedRuntime).toBe("STANDARD");
    expect(result.reasonCode).toContain("FALLBACK");
    expect(result.reasonText).toContain("Premium");
  });

  it("downgrades unsupported provider/runtime pairs deterministically", () => {
    const first = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "MOCK",
      flow: { ...informationalFlow, runtimeMode: "PREMIUM" },
    });
    const second = selectRuntime({
      tenant: { premiumVoiceEnabled: true },
      provider: "MOCK",
      flow: { ...informationalFlow, runtimeMode: "PREMIUM" },
    });

    expect(first).toEqual(second);
    expect(first.selectedRuntime).toBe("STANDARD");
    expect(first.reasonText).toBeTruthy();
  });
});
