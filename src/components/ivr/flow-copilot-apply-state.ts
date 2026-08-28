import type { CopilotPhase } from "./flow-copilot-state";

export interface CopilotDraftGraph {
  nodes: unknown[];
  edges: unknown[];
}

/**
 * A candidate is generated against one precise local draft.  The serialized
 * graph is deliberately used only as a freshness token; it is never persisted
 * or sent to the published-flow apply endpoint.
 */
export function getCopilotDraftFingerprint(graph: CopilotDraftGraph): string {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges });
}

export function getCopilotApplyState(input: {
  hasCandidate: boolean;
  validationValid: boolean;
  hasMissingResources: boolean;
  candidateBaseFingerprint: string | null;
  currentDraftFingerprint: string;
  candidateVersion: number;
  appliedCandidateVersion: number | null;
  phase: CopilotPhase;
}) {
  const isApplied = input.hasCandidate
    && input.appliedCandidateVersion === input.candidateVersion;
  const isStale = input.hasCandidate
    && !isApplied
    && input.candidateBaseFingerprint !== null
    && input.candidateBaseFingerprint !== input.currentDraftFingerprint;
  const hasValidationProblem = !input.validationValid || input.hasMissingResources;
  const isApplying = input.phase === "applying";
  const canApply = input.hasCandidate
    && !hasValidationProblem
    && !isStale
    && !isApplied
    && !isApplying;

  return {
    visible: input.hasCandidate,
    isApplied,
    isStale,
    canApply,
    label: isApplying
      ? "Applying to Builder..."
      : hasValidationProblem
        ? "Resolve validation before applying"
        : isStale
          ? "Regenerate to apply latest draft"
          : isApplied
            ? "Already applied to Builder"
            : "Apply to Builder",
  };
}
