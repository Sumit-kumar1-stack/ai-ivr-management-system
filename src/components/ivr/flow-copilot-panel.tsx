"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { isAxiosError } from "axios";

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/axios";
import { normalizeIVRMenuRouting } from "@/services/ivr/ivr-menu-routing.service";

import { useIVRBuilder } from "./ivr-builder-context";
import {
  getCopilotApplyState,
  getCopilotDraftFingerprint,
} from "./flow-copilot-apply-state";
import { getCopilotActionState, type CopilotPhase } from "./flow-copilot-state";
import { summarizeCopilotPatch } from "@/services/ivr/ivr-flow-review.service";

import type { FlowCopilotMode } from "@/services/ivr/flow-copilot.service";

interface CopilotResponse {
  success: boolean;
  data?: {
    summary: string;
    warnings: string[];
    assumptions?: string[];
    missingResources?: string[];
    suggestedTests?: string[];
    candidateFlow?: {
      name?: string;
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        type?: string;
        sourceHandle?: string;
        targetHandle?: string;
        data?: Record<string, unknown>;
      }>;
    };
    candidatePatch?: {
      operations: Array<{
        op: string;
        targetId?: string;
      }>;
      added: string[];
      modified: string[];
      removed: string[];
    };
    validation?: {
      valid: boolean;
      errors: Array<{
        code: string;
        nodeId: string | null;
        field: string | null;
        message: string;
        severity: "ERROR" | "WARNING";
      }>;
      warnings: Array<{
        code: string;
        nodeId: string | null;
        field: string | null;
        message: string;
        severity: "ERROR" | "WARNING";
      }>;
      issues: Array<{
        code: string;
        nodeId: string | null;
        field: string | null;
        message: string;
        severity: "ERROR" | "WARNING";
      }>;
    };
  };
  message?: string;
}

interface CandidateFlow {
  name?: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    sourceHandle?: string;
    targetHandle?: string;
    data?: Record<string, unknown>;
  }>;
}

interface CandidatePatch {
  operations: Array<{
    op: string;
    targetId?: string;
  }>;
  added: string[];
  modified: string[];
  removed: string[];
}

interface CopilotValidation {
  valid: boolean;
  errors: Array<{
    code: string;
    nodeId: string | null;
    field: string | null;
    message: string;
    severity: "ERROR" | "WARNING";
  }>;
  warnings: Array<{
    code: string;
    nodeId: string | null;
    field: string | null;
    message: string;
    severity: "ERROR" | "WARNING";
  }>;
  issues: Array<{
    code: string;
    nodeId: string | null;
    field: string | null;
    message: string;
    severity: "ERROR" | "WARNING";
  }>;
}

export function getCopilotErrorMessage(error: unknown): string {
  if (!isAxiosError(error) || !error.response?.data || typeof error.response.data !== "object") {
    return error instanceof Error ? error.message : "IVR copilot could not generate a suggestion";
  }

  const payload = error.response.data as {
    code?: unknown;
    message?: unknown;
    details?: { formErrors?: unknown[]; fieldErrors?: Record<string, unknown[]> };
    issues?: Array<{ message?: unknown }>;
  };
  const detailMessages = [
    ...(Array.isArray(payload.issues) ? payload.issues.map(issue => issue.message) : []),
    ...(Array.isArray(payload.details?.formErrors) ? payload.details.formErrors : []),
    ...Object.values(payload.details?.fieldErrors ?? {}).flat(),
  ].filter((message): message is string => typeof message === "string" && message.trim().length > 0);
  const message = typeof payload.message === "string" ? payload.message : "IVR copilot could not generate a suggestion";
  const code = typeof payload.code === "string" ? payload.code : null;

  return [code, message, ...detailMessages.slice(0, 3)].filter(Boolean).join(" — ");
}

export default function FlowCopilotPanel() {
  const {
    nodes,
    edges,
    flowName,
    builderContext,
    setMode,
    applyGeneratedGraph,
  } = useIVRBuilder();

  const [command, setCommand] = useState<FlowCopilotMode>("GENERATE");
  const [prompt, setPrompt] = useState(
    "Create a friendly outbound flow with a greeting, AI conversation, lead capture for interested callers, callback handling, and human transfer when requested."
  );
  const [phase, setPhase] = useState<CopilotPhase>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const requestSequence = useRef(0);
  const candidateVersionSequence = useRef(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [missingResources, setMissingResources] = useState<string[]>([]);
  const [suggestedTests, setSuggestedTests] = useState<string[]>([]);
  const [candidateFlow, setCandidateFlow] = useState<CandidateFlow | null>(null);
  const [candidatePatch, setCandidatePatch] = useState<CandidatePatch | null>(null);
  const [validation, setValidation] = useState<CopilotValidation | null>(null);
  const [candidateVersion, setCandidateVersion] = useState(0);
  const [candidateBaseFingerprint, setCandidateBaseFingerprint] = useState<string | null>(null);
  const [appliedCandidateVersion, setAppliedCandidateVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftFingerprint = useMemo(
    () => getCopilotDraftFingerprint({ nodes, edges }),
    [nodes, edges]
  );

  const capabilitySummary = useMemo(() => {
    return [
      `Context: ${builderContext.kind.toLowerCase().replace("_", " ")}`,
      `Current flow nodes: ${nodes.length}`,
      `Current flow edges: ${edges.length}`,
    ];
  }, [builderContext.kind, nodes.length, edges.length]);

  const hasGeneratedResult = candidateFlow !== null;
  const controls = getCopilotActionState({ command, hasGeneratedResult, phase });
  const { isGenerating, isGenerateCommand } = controls;
  const applyState = getCopilotApplyState({
    hasCandidate: candidateFlow !== null,
    validationValid: Boolean(validation?.valid),
    hasMissingResources: missingResources.length > 0,
    candidateBaseFingerprint,
    currentDraftFingerprint: draftFingerprint,
    candidateVersion,
    appliedCandidateVersion,
    phase,
  });
  const candidatePatchSummary = useMemo(() => (
    candidateFlow
      ? summarizeCopilotPatch(
          { nodes, edges },
          { nodes: candidateFlow.nodes as never, edges: candidateFlow.edges as never }
        )
      : []
  ), [candidateFlow, edges, nodes]);

  async function requestSuggestion(kind: "generate" | "regenerate" = "generate") {
    if (isGenerating || phase === "applying") {
      return;
    }

    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    const draftFingerprintAtRequest = draftFingerprint;
    const hadPreviousResult = hasGeneratedResult;
    const wasPreviewOpen = previewOpen;
    setPhase(kind === "regenerate" ? "regenerating" : "generating");
    setError(null);

    try {
      const { data } = await api.post<CopilotResponse>("/ivr-flows/copilot", {
        mode: command,
        prompt,
        flowName,
        campaignId: builderContext.campaignId ?? null,
        inboundProfileId: builderContext.inboundProfileId ?? null,
        returnTo: builderContext.returnTo ?? null,
        currentFlow: {
          nodes,
          edges,
        },
      });

      if (!data.success || !data.data) {
        throw new Error(data.message ?? "IVR copilot could not generate a suggestion");
      }

      // Ignore an out-of-date response if another request was started first.
      if (sequence !== requestSequence.current) return;

      setSummary(data.data.summary);
      setWarnings(data.data.warnings ?? []);
      setAssumptions(data.data.assumptions ?? []);
      setMissingResources(data.data.missingResources ?? []);
      setSuggestedTests(data.data.suggestedTests ?? []);
      const nextCandidate = data.data.candidateFlow as CandidateFlow | undefined;
      setCandidateFlow(nextCandidate ?? null);
      setCandidatePatch((data.data.candidatePatch as CandidatePatch | undefined) ?? null);
      if (nextCandidate) {
        const nextCandidateVersion = candidateVersionSequence.current + 1;
        candidateVersionSequence.current = nextCandidateVersion;
        setCandidateVersion(nextCandidateVersion);
        setCandidateBaseFingerprint(draftFingerprintAtRequest);
        setAppliedCandidateVersion(null);
      } else {
        setCandidateBaseFingerprint(null);
        setAppliedCandidateVersion(null);
      }
      const nextValidation = data.data.validation as Partial<CopilotValidation> | undefined;
      setValidation(nextValidation
        ? {
            valid: Boolean(nextValidation.valid),
            errors: nextValidation.errors ?? [],
            warnings: nextValidation.warnings ?? [],
            issues: nextValidation.issues ?? [
              ...(nextValidation.errors ?? []),
              ...(nextValidation.warnings ?? []),
            ],
          }
        : null);
      setPreviewOpen(isGenerateCommand ? (kind === "regenerate" ? wasPreviewOpen : false) : true);
      setPhase("generated");
    } catch (suggestionError) {
      if (sequence !== requestSequence.current) return;
      setError(
        getCopilotErrorMessage(suggestionError)
      );
      // A failed regeneration must leave the last successful preview intact.
      if (!hadPreviousResult) {
        setCandidateFlow(null);
        setCandidatePatch(null);
        setValidation(null);
        setWarnings([]);
        setAssumptions([]);
        setMissingResources([]);
        setSuggestedTests([]);
        setSummary(null);
      }
      setPhase(hadPreviousResult ? "generated" : "error");
    } finally {
      if (sequence === requestSequence.current) {
        setPhase(current => current === "regenerating" || current === "generating" ? (hasGeneratedResult ? "generated" : "idle") : current);
      }
    }
  }

  function applySuggestion() {
    if (!candidateFlow || !applyState.canApply) {
      return;
    }

    try {
      setPhase("applying");
      const normalizedGraph = normalizeIVRMenuRouting({
        nodes: candidateFlow.nodes as never,
        edges: candidateFlow.edges as never,
      });
      if (normalizedGraph.nodes.length === 0) {
        throw new Error("The generated candidate does not contain an editable graph.");
      }

      // applyGeneratedGraph owns the same editable draft consumed by the canvas,
      // property panels, save, validation, and simulation. It marks this
      // atomic graph replacement unsaved without persisting or publishing.
      applyGeneratedGraph({
        nodes: normalizedGraph.nodes as never,
        edges: normalizedGraph.edges as never,
      });
      setAppliedCandidateVersion(candidateVersion);
      setPhase("generated");
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Could not apply the generated flow.");
      setPhase("previewing");
    }
  }

  return (
    <div className="w-96 overflow-y-auto border-l border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bot className="h-5 w-5 text-blue-600" />
            Build with AI
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            The copilot proposes changes against the current canonical draft.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("MANUAL")}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <X className="inline-block h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        {capabilitySummary.map(line => (
          <div key={line} className="py-0.5">
            {line}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Command</label>
          <select
            value={command}
            onChange={event => setCommand(event.target.value as FlowCopilotMode)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="GENERATE">Generate</option>
            <option value="MODIFY">Modify</option>
            <option value="EXPLAIN">Explain</option>
            <option value="VALIDATE">Validate</option>
            <option value="REPAIR">Repair</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Prompt</label>
          <Textarea
            rows={10}
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="Describe the flow change you want..."
            className="mt-2"
          />
        </div>

        <div className="flex gap-2">
          {controls.showInitialGenerate ? (
            <Button
              type="button"
              onClick={() => void requestSuggestion("generate")}
              disabled={isGenerating}
              className="flex-1"
            >
              {isGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Generate</>
              )}
            </Button>
          ) : controls.showGeneratedActions ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreviewOpen(true);
                  setPhase("previewing");
                }}
                disabled={isGenerating}
                className="flex-1"
              >
                Preview Changes
              </Button>
              <Button
                type="button"
                onClick={() => void requestSuggestion("regenerate")}
                disabled={isGenerating}
                className="flex-1"
              >
                {phase === "regenerating" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Regenerating...</>
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" />Regenerate</>
                )}
              </Button>
            </>
          ) : controls.showGenericPreview ? (
            <Button
              type="button"
              onClick={() => void requestSuggestion("generate")}
              disabled={isGenerating}
              className="flex-1"
            >
              {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Working...</> : <><Sparkles className="mr-2 h-4 w-4" />Preview Changes</>}
            </Button>
          ) : null}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && summary && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2 font-semibold">
              <WandSparkles className="h-4 w-4" />
              Suggested Result
            </div>
            <p className="mt-2 leading-6">{summary}</p>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && assumptions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <div className="font-semibold text-slate-900">Assumptions</div>
            <ul className="mt-2 space-y-1 leading-6">
              {assumptions.map(item => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </div>
            <ul className="mt-2 space-y-1 leading-6">
              {warnings.map(warning => (
                <li key={warning}>- {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && missingResources.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <div className="font-semibold">Missing resources</div>
            <ul className="mt-2 space-y-1 leading-6">
              {missingResources.map(item => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && suggestedTests.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
            <div className="font-semibold text-slate-900">Suggested tests</div>
            <ul className="mt-2 space-y-1 leading-6">
              {suggestedTests.map(item => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && validation && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">Deterministic validation</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  validation.valid
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {validation.valid ? "Valid" : "Invalid"}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {validation.errors.length} error(s), {validation.warnings.length} warning(s)
            </div>
            {validation.issues.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs">
                {validation.issues.map((issue, index) => (
                  <li
                    key={`${issue.code}-${issue.nodeId ?? "flow"}-${issue.field ?? "general"}-${index}`}
                    className={issue.severity === "ERROR" ? "text-rose-700" : "text-amber-700"}
                  >
                    <span className="font-semibold">{issue.code}</span>
                    {issue.nodeId ? ` · node: ${issue.nodeId}` : ""}
                    {issue.field ? ` · ${issue.field}` : ""}
                    {` — ${issue.message}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && candidatePatch && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
              <span className="font-semibold">Change summary</span>
              <span className="text-xs text-slate-500">
                +{candidatePatch.added.length} / ~{candidatePatch.modified.length} / -{candidatePatch.removed.length}
              </span>
            </div>
            <ul className="space-y-1 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
              {candidatePatchSummary.map(line => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
          </div>
        )}

        {(previewOpen || !isGenerateCommand) && candidateFlow && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
              <span className="font-semibold">Preview</span>
              <span className="text-xs text-slate-500">
                {candidateFlow.nodes.length} nodes, {candidateFlow.edges.length} edges
              </span>
            </div>

            <div className="max-h-52 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-600">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(candidateFlow, null, 2)}
              </pre>
            </div>

          </div>
        )}

        {candidateFlow && (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
            <Button
              type="button"
              className="w-full"
              onClick={applySuggestion}
              disabled={!applyState.canApply}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {applyState.label}
            </Button>
            {applyState.isStale && (
              <p className="text-xs text-amber-700">
                The manual draft changed after this candidate was generated.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
