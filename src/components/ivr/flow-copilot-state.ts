import type { FlowCopilotMode } from "@/services/ivr/flow-copilot.service";

export type CopilotPhase =
  | "idle"
  | "generating"
  | "generated"
  | "previewing"
  | "regenerating"
  | "applying"
  | "error";

export function getCopilotActionState(input: {
  command: FlowCopilotMode;
  hasGeneratedResult: boolean;
  phase: CopilotPhase;
}) {
  const isGenerating = input.phase === "generating" || input.phase === "regenerating";
  const isGenerateCommand = input.command === "GENERATE" || (input.command as string) === "CREATE";
  const isModifyCommand = input.command === "MODIFY";

  return {
    isGenerating,
    isGenerateCommand,
    isModifyCommand,
    showInitialGenerate: isGenerateCommand && !input.hasGeneratedResult,
    showGeneratedActions: isGenerateCommand && input.hasGeneratedResult,
    showModifyAction: isModifyCommand,
    showGenericPreview: !isGenerateCommand && !isModifyCommand,
    primaryLabel: isModifyCommand
      ? input.phase === "generating"
        ? "Modifying..."
        : "Modify Draft"
      : input.phase === "generating"
        ? "Generating..."
        : input.phase === "regenerating"
          ? "Regenerating..."
          : isGenerateCommand && !input.hasGeneratedResult
            ? "Generate"
            : "Preview Changes",
  };
}
