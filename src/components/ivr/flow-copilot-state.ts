import type { FlowCopilotMode } from "@/services/ivr/flow-copilot.service";

export type CopilotPhase = "idle" | "generating" | "generated" | "previewing" | "regenerating" | "applying" | "error";

export function getCopilotActionState(input: {
  command: FlowCopilotMode;
  hasGeneratedResult: boolean;
  phase: CopilotPhase;
}) {
  const isGenerating = input.phase === "generating" || input.phase === "regenerating";
  const isGenerateCommand = input.command === "GENERATE";

  return {
    isGenerating,
    isGenerateCommand,
    showInitialGenerate: isGenerateCommand && !input.hasGeneratedResult,
    showGeneratedActions: isGenerateCommand && input.hasGeneratedResult,
    showGenericPreview: !isGenerateCommand,
    primaryLabel: input.phase === "generating"
      ? "Generating..."
      : input.phase === "regenerating"
        ? "Regenerating..."
        : isGenerateCommand && !input.hasGeneratedResult
          ? "Generate"
          : "Preview Changes",
  };
}
