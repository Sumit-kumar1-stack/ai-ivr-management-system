import { describe, expect, it } from "vitest";

import { buildIvrEntryContextPrompt } from "@/services/voice/gemini-live-media.service";

describe("Gemini Live staged entry context", () => {
  it("states the default AI path without inventing a keypad selection", () => {
    const prompt = buildIvrEntryContextPrompt({
      flowId: "flow-1",
      currentNodeId: "entry-menu",
      lastTrigger: "DEFAULT",
      lastValue: null,
      inputExperience: "STAGED_HYBRID",
      inputStage: "ENTRY_IVR",
    });

    expect(prompt).toContain("Caller made no keypad selection");
    expect(prompt).toContain("Do not infer a selected intent, department, or language.");
    expect(prompt).not.toContain("Caller selected intent:");
  });

  it("passes the persisted staged selection to Gemini Live", () => {
    expect(buildIvrEntryContextPrompt({
      flowId: "flow-1",
      currentNodeId: "ai",
      lastTrigger: "DTMF",
      lastValue: "1",
      selectedIntent: "PERSONAL_LOAN",
      selectedDepartment: "Loans",
      preferredLanguage: "Hindi",
    })).toContain("Preferred conversational language: Hindi");
  });
});
