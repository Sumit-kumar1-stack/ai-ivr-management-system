import { describe, expect, it } from "vitest";

import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";

describe("IVRFlowValidator", () => {
  it("accepts a minimal valid flow", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        {
          id: "menu",
          data: {
            nodeKind: "HYBRID_MENU",
            prompt: "Press 1",
            options: [
              { digit: "1", label: "Continue", destinationNodeId: "end" },
            ],
          },
        },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "end", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a safe AUTO runtime configuration with a configured fallback", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", runtimeMode: "AUTO", runtimeDefault: "STANDARD" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "end", data: { trigger: "DEFAULT" } },
      ],
      provider: "TWILIO",
      tenantPremiumVoiceEnabled: true,
      voiceRuntime: "CASCADED",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid runtime values and non-entry runtime switches", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", runtimeMode: "SPEED" } },
        { id: "menu", data: { nodeKind: "GREETING", runtimeMode: "PREMIUM" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "end", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "INVALID_RUNTIME_VALUE",
      "INVALID_RUNTIME_SWITCH_LOCATION",
    ]));
    expect(result.errors.find(issue => issue.code === "INVALID_RUNTIME_VALUE")).toMatchObject({
      category: "runtime",
      title: expect.any(String),
      description: expect.any(String),
      suggestedFix: expect.any(String),
    });
  });

  it("requires a fallback when AUTO is selected", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", runtimeMode: "AUTO" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "end", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AUTO_RUNTIME_DEFAULT_REQUIRED", field: "runtimeDefault" }),
    ]));
  });

  it("rejects Premium without entitlement and unsupported provider/runtime pairs", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", runtimeMode: "PREMIUM", runtimeDefault: "STANDARD" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "end", data: { trigger: "DEFAULT" } },
      ],
      provider: "MOCK",
      tenantPremiumVoiceEnabled: false,
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "PREMIUM_VOICE_NOT_ENTITLED",
      "UNSUPPORTED_PROVIDER_RUNTIME",
    ]));
  });

  it("warns, without invalidating the flow, when Plivo Gemini Live is bound to hybrid keypad input", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", inputMode: "VOICE_AND_DTMF" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Press 1 to continue.", options: [{ digit: "1", label: "Continue", destinationNodeId: "end" }] } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "end", data: { trigger: "DTMF", value: "1" } },
      ],
      provider: "PLIVO",
      voiceRuntime: "GEMINI_LIVE",
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REALTIME_INPUT_UNSUPPORTED", field: "inputMode" }),
    ]));
  });

  it("keeps Plivo staged hybrid valid while retaining the realtime-DTMF warning", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", inputExperience: "STAGED_HYBRID", runtimeMode: "AUTO", runtimeDefault: "STANDARD", defaultAiNodeId: "ai" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose an option.", fallbackNodeId: "end", runtimeMenu: { maxAttempts: 3, timeoutSeconds: 8 }, options: [
          { digit: "1", label: "Continue", destinationNodeId: "ai" },
        ] } },
        { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "ai", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { source: "menu", target: "end", data: { trigger: "DEFAULT" } },
      ],
      provider: "PLIVO",
      voiceRuntime: "GEMINI_LIVE",
      tenantPremiumVoiceEnabled: true,
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("flags duplicate menu digits and missing destinations", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        {
          id: "menu",
          data: {
            nodeKind: "HYBRID_MENU",
            prompt: "Menu",
            options: [
              { digit: "1", label: "One" },
              { digit: "1", label: "Duplicate" },
            ],
          },
        },
      ],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_MENU_DIGIT", "MISSING_MENU_DESTINATION"])
    );
  });

  it("accepts a legacy dtmf option while new candidates use digit", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", escapeNodeId: "end", options: [{ dtmf: "1", label: "Continue", destinationNodeId: "end" }] } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "end", data: { trigger: "DTMF", value: "1" } },
      ],
    });

    expect(result).toMatchObject({ valid: true, errors: [] });
  });

  it("accepts an explicit staged entry mapping, including a direct agent action", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", inputExperience: "STAGED_HYBRID", defaultAiNodeId: "ai" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose an option", runtimeMenu: { maxAttempts: 3, timeoutSeconds: 8 }, options: [
          { digit: "1", label: "Personal loans", intent: "PERSONAL_LOAN", department: "Loans", language: "Hindi", destinationNodeId: "ai" },
          { digit: "0", label: "Speak to an agent", action: "AGENT_REQUEST" },
        ] } },
        { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "ai", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
      ],
    });

    expect(result.errors).toHaveLength(0);
  });

  it("rejects malformed staged option digits and targets without changing legacy validation", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", inputExperience: "STAGED_HYBRID", defaultAiNodeId: "ai" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose", runtimeMenu: { maxAttempts: 0, timeoutSeconds: 61 }, options: [
          { digit: "12", label: "Invalid", destinationNodeId: "missing", language: "French" },
          { digit: "12", label: "Duplicate", destinationNodeId: "missing" },
        ] } },
        { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_MENU_DIGIT", "STAGED_DIGIT_INVALID", "STAGED_TARGET_INVALID",
      "STAGED_MAX_ATTEMPTS_INVALID", "STAGED_TIMEOUT_INVALID", "STAGED_LANGUAGE_INVALID",
    ]));
  });

  it("flags unreachable and unsupported nodes", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "orphan", data: { nodeKind: "UNKNOWN_KIND" } },
      ],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_NODE_TYPE", "UNREACHABLE_NODE"])
    );
  });

  it("requires canonical transfer data and the executor's success and failure outcomes", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "transfer", data: { nodeKind: "HUMAN_TRANSFER", destinationId: "agent-1" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "transfer", data: { trigger: "DEFAULT" } },
        { source: "transfer", target: "end", data: { trigger: "TRANSFER_FAILED" } },
      ],
      allowedTransferDestinationIds: ["agent-1"],
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "TRANSFER_DESTINATION_REQUIRED",
      "TRANSFER_LEGACY_FIELD",
      "TRANSFER_OUTCOME_EDGE_MISSING",
    ]));
  });

  it("accepts multiple terminal nodes and ignores React Flow display metadata", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
        { id: "auth", type: "ivr", position: { x: 120, y: 0 }, data: { nodeKind: "AUTH_GATE", requiredAuthLevel: "OTP" } },
        { id: "transfer", type: "ivr", position: { x: 200, y: 0 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1" } },
        { id: "end", type: "ivr", position: { x: 400, y: 0 }, data: { nodeKind: "END_CALL" } },
        { id: "fallback", type: "ivr", position: { x: 400, y: 100 }, data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "auth", type: "smoothstep", sourceHandle: "source", targetHandle: "target", data: { trigger: "DEFAULT" } },
        { source: "auth", target: "transfer", type: "smoothstep", sourceHandle: "source", targetHandle: "target", data: { trigger: "DEFAULT" } },
        { source: "transfer", target: "end", type: "smoothstep", sourceHandle: "source", targetHandle: "target", data: { trigger: "HUMAN_TRANSFER" } },
        { source: "transfer", target: "fallback", type: "smoothstep", sourceHandle: "source", targetHandle: "target", data: { trigger: "ACTION_FAILURE" } },
      ],
      allowedTransferDestinationIds: ["agent-1"],
    });

    expect(result).toMatchObject({ valid: true, errors: [] });
  });

  it("flags unconditional cycles without an exit or retry limit", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "start", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toContain("UNBOUNDED_LOOP");
  });

  it("rejects sensitive action paths that can be reached without authentication", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "action", data: { nodeKind: "ACTION", actionCode: "PAY_BILL" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "action", data: { trigger: "DEFAULT" } },
        { source: "action", target: "end", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AUTH_PATH_REQUIRED", category: "auth" }),
    ]));
  });

  it("reports missing start, dangling targets, and dead-end fallback gaps deterministically", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose", options: [{ digit: "1", label: "Continue", destinationNodeId: "missing" }] } },
      ],
      edges: [
        { source: "menu", target: "missing", data: { trigger: "DTMF", value: "1" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "INVALID_START_COUNT",
      "MENU_DESTINATION_NODE_MISSING",
      "EDGE_TARGET_MISSING",
    ]));
    expect(result.warnings.map(issue => issue.code)).toContain("MISSING_FALLBACK");
  });

  it("flags invalid fallback nodes and keeps a valid terminal END flow accepted", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "transfer", data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1", fallbackNodeId: "missing" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "transfer", data: { trigger: "DEFAULT" } },
        { source: "transfer", target: "end", data: { trigger: "HUMAN_TRANSFER" } },
        { source: "transfer", target: "end", data: { trigger: "ACTION_FAILURE" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).toContain("FALLBACK_NODE_INVALID");
    expect(result.valid).toBe(false);
  });

  it("accepts bounded retry cycles and conditional cycles with exits", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose", maxAttempts: 3, fallbackNodeId: "end", options: [{ digit: "1", label: "Retry", destinationNodeId: "menu" }] } },
        { id: "condition", data: { nodeKind: "CONDITION", conditionExpression: "x > 0" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
        { source: "menu", target: "menu", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { source: "menu", target: "end", data: { trigger: "DEFAULT" } },
        { source: "condition", target: "condition", data: { trigger: "DEFAULT" } },
        { source: "condition", target: "end", data: { trigger: "DEFAULT" } },
      ],
    });

    expect(result.errors.map(issue => issue.code)).not.toContain("UNBOUNDED_LOOP");
  });

  it("preserves info severity without invalidating the flow", () => {
    const result = validateIVRFlowDefinition({
      nodes: [
        { id: "start", data: { nodeKind: "START", runtimeMode: "AUTO", runtimeDefault: "STANDARD", label: "FAQ", description: "Information flow" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "end", data: { trigger: "DEFAULT" } },
      ],
      provider: "TWILIO",
      tenantPremiumVoiceEnabled: true,
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "INFO", code: "AUTO_RUNTIME_INFORMATIONAL" }),
    ]));
  });
});
