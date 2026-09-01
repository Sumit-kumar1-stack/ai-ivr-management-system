import { describe, expect, it } from "vitest";

import { getCopilotActionState } from "@/components/ivr/flow-copilot-state";

describe("FlowCopilot action state", () => {
  it("shows only Generate before a Generate result exists", () => {
    expect(getCopilotActionState({ command: "GENERATE", hasGeneratedResult: false, phase: "idle" })).toMatchObject({
      showInitialGenerate: true,
      showGeneratedActions: false,
      primaryLabel: "Generate",
    });
  });

  it("shows Preview Changes and Regenerate after a successful Generate", () => {
    expect(getCopilotActionState({ command: "GENERATE", hasGeneratedResult: true, phase: "generated" })).toMatchObject({
      showInitialGenerate: false,
      showGeneratedActions: true,
      primaryLabel: "Preview Changes",
    });
  });

  it("keeps the preview action visible while regeneration is in progress", () => {
    expect(getCopilotActionState({ command: "GENERATE", hasGeneratedResult: true, phase: "regenerating" })).toMatchObject({
      showGeneratedActions: true,
      isGenerating: true,
      primaryLabel: "Regenerating...",
    });
  });

  it("shows Modify Draft for MODIFY command", () => {
    expect(getCopilotActionState({ command: "MODIFY", hasGeneratedResult: true, phase: "idle" })).toMatchObject({
      showModifyAction: true,
      isModifyCommand: true,
      primaryLabel: "Modify Draft",
    });
  });

  it("shows Modifying... when MODIFY is in generating phase", () => {
    expect(getCopilotActionState({ command: "MODIFY", hasGeneratedResult: true, phase: "generating" })).toMatchObject({
      showModifyAction: true,
      isGenerating: true,
      primaryLabel: "Modifying...",
    });
  });

  it("does not change the existing control model for non-Generate commands", () => {
    expect(getCopilotActionState({ command: "VALIDATE", hasGeneratedResult: false, phase: "idle" })).toMatchObject({
      showGenericPreview: true,
      showInitialGenerate: false,
    });
  });
});
