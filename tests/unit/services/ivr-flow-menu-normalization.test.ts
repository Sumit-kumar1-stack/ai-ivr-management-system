import { describe, expect, it } from "vitest";

import { normalizePersistedMenuDigits } from "@/services/ivr-flow.service";

describe("IVR flow persistence menu normalization", () => {
  it("writes top-level options and removes legacy aliases for a legacy menu draft", () => {
    const nodes = normalizePersistedMenuDigits([
      {
        id: "menu",
        data: {
          nodeKind: "HYBRID_MENU",
          menuOptions: [{ dtmf: "1", label: "Loan information", destinationNodeId: "knowledge", phrases: ["loan"], intent: "LOAN_INFO", keywords: ["personal loan"] }],
        },
      },
    ] as never) as Array<{ data: Record<string, unknown> }>;

    expect(nodes[0]?.data.options).toEqual([{
      digit: "1",
      label: "Loan information",
      destinationNodeId: "knowledge",
      phrases: ["loan"],
      intent: "LOAN_INFO",
      keywords: ["personal loan"],
    }]);
    expect(nodes[0]?.data).not.toHaveProperty("menuOptions");
    expect(nodes[0]?.data.runtimeMenu).toBeUndefined();
  });

  it("upgrades a saved runtimeMenu.options graph without retaining the nested option alias", () => {
    const nodes = normalizePersistedMenuDigits([
      {
        id: "menu",
        data: {
          nodeKind: "HYBRID_MENU",
          runtimeMenu: {
            type: "DTMF_MENU",
            prompt: "Press 1.",
            options: [{ digit: "1", label: "Loan information", destinationNodeId: "knowledge" }],
          },
        },
      },
    ] as never) as Array<{ data: Record<string, unknown> }>;

    expect(nodes[0]?.data.options).toHaveLength(1);
    expect(nodes[0]?.data.runtimeMenu).toMatchObject({ type: "DTMF_MENU", prompt: "Press 1." });
    expect((nodes[0]?.data.runtimeMenu as Record<string, unknown>).options).toBeUndefined();
  });
});
