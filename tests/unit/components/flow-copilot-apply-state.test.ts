import { describe, expect, it } from "vitest";

import {
  getCopilotApplyState,
  getCopilotDraftFingerprint,
} from "@/components/ivr/flow-copilot-apply-state";

const draft = { nodes: [{ id: "start" }], edges: [] };
const draftFingerprint = getCopilotDraftFingerprint(draft);

function state(overrides: Partial<Parameters<typeof getCopilotApplyState>[0]> = {}) {
  return getCopilotApplyState({
    hasCandidate: true,
    validationValid: true,
    hasMissingResources: false,
    candidateBaseFingerprint: draftFingerprint,
    currentDraftFingerprint: draftFingerprint,
    candidateVersion: 1,
    appliedCandidateVersion: null,
    phase: "generated",
    ...overrides,
  });
}

describe("FlowCopilot apply eligibility", () => {
  it("keeps Apply to Builder visible and enabled for a valid current candidate", () => {
    expect(state()).toMatchObject({ visible: true, canApply: true, label: "Apply to Builder" });
  });

  it("does not let preview state clear a valid candidate's apply eligibility", () => {
    expect(state({ phase: "previewing" })).toMatchObject({ canApply: true, label: "Apply to Builder" });
  });

  it("disables application with an explicit validation resolution message", () => {
    expect(state({ validationValid: false })).toMatchObject({
      canApply: false,
      label: "Resolve validation before applying",
    });
  });

  it("does not apply a candidate generated for an older local draft", () => {
    expect(state({ currentDraftFingerprint: getCopilotDraftFingerprint({ nodes: [{ id: "changed" }], edges: [] }) })).toMatchObject({
      canApply: false,
      isStale: true,
      label: "Regenerate to apply latest draft",
    });
  });

  it("does not apply the same candidate twice", () => {
    expect(state({ appliedCandidateVersion: 1 })).toMatchObject({
      canApply: false,
      isApplied: true,
      label: "Already applied to Builder",
    });
  });
});
