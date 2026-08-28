"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/axios";

type ValidationIssue = {
  code: string;
  nodeId: string | null;
  edgeId?: string | null;
  category?: string;
  title?: string;
  description?: string;
  suggestedFix?: string | null;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
};

type StepExpectationDraft = {
  expectedNodeId: string;
  expectedNodeType: string;
  expectedIntent: string;
  expectedLanguage: string;
  expectedRuntime: "STANDARD" | "PREMIUM" | "";
  expectedAuthState: "UNKNOWN" | "PASS" | "FAIL" | "NOT_REQUIRED" | "";
  expectedTransferRequested: boolean | null;
  expectedCallbackState: "NOT_REQUESTED" | "REQUESTED" | "SCHEDULED" | "UNAVAILABLE" | "";
  expectedCollectedFields: string;
};

type ScenarioStepDraft = {
  id: string;
  callerInput: string;
  dtmfInput: string;
  expected: StepExpectationDraft;
};

type StepSnapshot = {
  stepNumber: number;
  callerInput: string | null;
  dtmfInput: string | null;
  previousNodeId: string | null;
  currentNodeId: string | null;
  currentNodeType: string | null;
  matchedRoute: string | null;
  detectedIntent: string | null;
  language: string | null;
  configuredRuntime: "STANDARD" | "PREMIUM" | "AUTO" | null;
  selectedRuntime: "STANDARD" | "PREMIUM" | null;
  knowledgeEligible: boolean;
  authenticationState: "UNKNOWN" | "PASS" | "FAIL" | "NOT_REQUIRED";
  collectedFields: Record<string, string>;
  knowledgeScope: string | null;
  toolEligibility: string | null;
  toolDryRunResult: string | null;
  transferState: "NOT_REQUESTED" | "REQUESTED" | "DRY_RUN" | "UNAVAILABLE";
  callbackState: "NOT_REQUESTED" | "REQUESTED" | "DRY_RUN" | "SCHEDULED" | "UNAVAILABLE";
  nextNodeId: string | null;
  warnings: string[];
  runtimeReasonCode?: string | null;
  runtimeReasonText?: string | null;
};

type ExpectationComparison = {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

type StepResult = {
  id: string;
  status: "PASS" | "FAIL" | "INCOMPLETE";
  expectation: Record<string, unknown> | null;
  comparisons: ExpectationComparison[];
  snapshot: StepSnapshot;
  issues: string[];
  validationIssues: ValidationIssue[];
};

type SimulationResponse = {
  validation?: {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    issues: ValidationIssue[];
  };
  blocked?: boolean;
  blockedIssues?: ValidationIssue[];
  status?: "PASS" | "FAIL" | "INCOMPLETE";
  scenario?: {
    name?: string;
    description?: string;
  };
  steps?: StepResult[];
  currentNodeId?: string | null;
  resultingNodeId?: string | null;
  matchedOption?: string | null;
  confidence?: number;
  transition?: string | null;
  actionWouldExecute?: string | null;
  responsePreview?: string | null;
  knowledgeScopeSummary?: string | null;
  warnings?: string[];
  trace?: string[];
};

interface Props {
  flowId?: string;
  nodes: unknown[];
  edges: unknown[];
  onFocusNode?: (nodeId: string) => void;
}

const STEP_ID_PREFIX = "step";

export default function IVRSimulatorPanel({ flowId, nodes, edges, onFocusNode }: Props) {
  const [scenarioName, setScenarioName] = useState("Caller journey");
  const [scenarioDescription, setScenarioDescription] = useState("Multi-step caller simulation");
  const [steps, setSteps] = useState<ScenarioStepDraft[]>(() => [createStep(1)]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validationSummary = useMemo(() => {
    const issues = result?.validation?.issues ?? [];
    return {
      errors: issues.filter(issue => issue.severity === "ERROR").length,
      warnings: issues.filter(issue => issue.severity === "WARNING").length,
      info: issues.filter(issue => issue.severity === "INFO").length,
    };
  }, [result]);

  function addStep(): void {
    setSteps(previous => [...previous, createStep(previous.length + 1)]);
  }

  function removeStep(index: number): void {
    setSteps(previous => previous.length <= 1 ? previous : previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateStep(index: number, updater: (draft: ScenarioStepDraft) => ScenarioStepDraft): void {
    setSteps(previous => previous.map((step, itemIndex) => itemIndex === index ? updater(step) : step));
  }

  async function runScenario() {
    if (!flowId || loading) return;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        nodes,
        edges,
        scenario: {
          name: scenarioName.trim() || "Caller journey",
          description: scenarioDescription.trim() || undefined,
          steps: steps.map(step => ({
            id: step.id,
            callerInput: step.callerInput.trim() || undefined,
            dtmfInput: step.dtmfInput.trim() || undefined,
            expected: buildExpectedPayload(step.expected),
          })),
        },
      };

      const { data } = await api.post(`/ivr-flows/${flowId}/simulate`, payload);
      if (!data?.success || !data.data) {
        throw new Error(data?.message ?? "IVR flow simulation could not be loaded");
      }

      const next = data.data as SimulationResponse;
      setResult(next);
      focusFirstAvailableNode(next);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : "IVR flow simulation could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  function focusFirstAvailableNode(simulation: SimulationResponse): void {
    const firstFocus =
      simulation.steps?.find(step => step.snapshot.currentNodeId)?.snapshot.currentNodeId ??
      simulation.resultingNodeId ??
      simulation.currentNodeId;
    if (firstFocus && onFocusNode) {
      onFocusNode(firstFocus);
    }
  }

  function resetScenario(): void {
    setResult(null);
    setError(null);
    setScenarioName("Caller journey");
    setScenarioDescription("Multi-step caller simulation");
    setSteps([createStep(1)]);
  }

  const scenarioStatus = result?.blocked ? "BLOCKED" : result?.status ?? null;

  return (
    <aside className="w-[420px] overflow-y-auto border-l border-slate-200/80 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Simulator</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Scenario playback</h3>
          <p className="mt-1 text-sm text-slate-500">
            Execute an ordered caller journey without placing real calls, messages, or mutations.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {!flowId && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Save the flow before running simulation.
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Scenario name</label>
          <Input value={scenarioName} onChange={event => setScenarioName(event.target.value)} placeholder="Caller journey" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <Textarea rows={3} value={scenarioDescription} onChange={event => setScenarioDescription(event.target.value)} placeholder="What this scenario is meant to prove" />
        </div>

        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={() => void runScenario()} disabled={!flowId || loading}>
            {loading ? "Running..." : "Run scenario"}
          </Button>
          <Button type="button" variant="outline" onClick={addStep} disabled={loading}>
            Add step
          </Button>
          <Button type="button" variant="outline" onClick={resetScenario} disabled={loading}>
            Reset
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result?.validation && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">Validator summary</div>
              <Badge variant={result.validation.valid ? "default" : "destructive"}>{result.validation.valid ? "Valid" : "Invalid"}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">Errors: {validationSummary.errors}</Badge>
              <Badge variant="secondary">Warnings: {validationSummary.warnings}</Badge>
              <Badge variant="secondary">Info: {validationSummary.info}</Badge>
            </div>
          </div>
        )}

        {result?.blocked && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">SIMULATION BLOCKED</div>
            <div className="mt-1">Validation reported blocking issues before the scenario could run safely.</div>
            {result.blockedIssues?.length ? (
              <div className="mt-3 space-y-2">
                {result.blockedIssues.map(issue => (
                  <IssueCard key={`${issue.code}-${issue.nodeId ?? "global"}-${issue.message}`} issue={issue} onFocusNode={onFocusNode} />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {steps.map((step, index) => {
          const stepResult = result?.steps?.[index];

          return (
            <section key={step.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step {index + 1}</p>
                  <h4 className="mt-1 text-base font-semibold text-slate-900">{scenarioName.trim() || "Caller journey"}</h4>
                </div>
                <div className="flex items-center gap-2">
                  {stepResult && <Badge variant={badgeVariant(stepResult.status)}>{stepResult.status}</Badge>}
                  <Button type="button" variant="outline" size="sm" onClick={() => removeStep(index)} disabled={loading || steps.length === 1}>
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Caller input</label>
                  <Textarea
                    rows={3}
                    value={step.callerInput}
                    onChange={event => updateStep(index, draft => ({ ...draft, callerInput: event.target.value }))}
                    placeholder='Example: "English" or "I need a personal loan"'
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">DTMF input</label>
                  <Input
                    value={step.dtmfInput}
                    onChange={event => updateStep(index, draft => ({ ...draft, dtmfInput: event.target.value }))}
                    placeholder="1"
                  />
                </div>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Expected state</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Expected node ID" value={step.expected.expectedNodeId} onChange={value => updateExpected(index, "expectedNodeId", value, updateStep)} placeholder="knowledge" />
                    <Field label="Expected node type" value={step.expected.expectedNodeType} onChange={value => updateExpected(index, "expectedNodeType", value, updateStep)} placeholder="KNOWLEDGE" />
                    <Field label="Expected intent" value={step.expected.expectedIntent} onChange={value => updateExpected(index, "expectedIntent", value, updateStep)} placeholder="PERSONAL_LOAN" />
                    <Field label="Expected language" value={step.expected.expectedLanguage} onChange={value => updateExpected(index, "expectedLanguage", value, updateStep)} placeholder="en" />

                    <SelectField
                      label="Expected runtime"
                      value={step.expected.expectedRuntime}
                      onChange={value => updateExpected(index, "expectedRuntime", value as StepExpectationDraft["expectedRuntime"], updateStep)}
                      options={["", "STANDARD", "PREMIUM"]}
                    />

                    <SelectField
                      label="Expected auth state"
                      value={step.expected.expectedAuthState}
                      onChange={value => updateExpected(index, "expectedAuthState", value as StepExpectationDraft["expectedAuthState"], updateStep)}
                      options={["", "UNKNOWN", "PASS", "FAIL", "NOT_REQUIRED"]}
                    />

                    <SelectField
                      label="Expected transfer requested"
                      value={step.expected.expectedTransferRequested === null ? "" : step.expected.expectedTransferRequested ? "true" : "false"}
                      onChange={value => updateStep(index, draft => ({ ...draft, expected: { ...draft.expected, expectedTransferRequested: value === "" ? null : value === "true" } }))}
                      options={["", "true", "false"]}
                    />

                    <SelectField
                      label="Expected callback state"
                      value={step.expected.expectedCallbackState}
                      onChange={value => updateExpected(index, "expectedCallbackState", value as StepExpectationDraft["expectedCallbackState"], updateStep)}
                      options={["", "NOT_REQUESTED", "REQUESTED", "SCHEDULED", "UNAVAILABLE"]}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Expected collected fields</label>
                    <Textarea
                      rows={3}
                      value={step.expected.expectedCollectedFields}
                      onChange={event => updateStep(index, draft => ({ ...draft, expected: { ...draft.expected, expectedCollectedFields: event.target.value } }))}
                      placeholder='{"selectedIntent":"PERSONAL_LOAN"}'
                    />
                  </div>
                </details>

                {stepResult && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={badgeVariant(stepResult.status)}>{stepResult.status}</Badge>
                      <Badge variant="secondary">Runtime: {stepResult.snapshot.selectedRuntime ?? "none"}</Badge>
                      <Badge variant="secondary">Node: {stepResult.snapshot.currentNodeId ?? "none"}</Badge>
                    </div>
                    {stepResult.comparisons.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected vs actual</div>
                        <div className="space-y-2">
                          {stepResult.comparisons.map(comparison => (
                            <div key={comparison.field} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-slate-900">{prettyFieldName(comparison.field)}</div>
                                <Badge variant={comparison.passed ? "default" : "destructive"}>{comparison.passed ? "Match" : "Mismatch"}</Badge>
                              </div>
                              <div className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                                <div>Expected: {formatComparisonValue(comparison.expected)}</div>
                                <div>Actual: {formatComparisonValue(comparison.actual)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ResultLine label="Detected intent" value={stepResult.snapshot.detectedIntent} />
                      <ResultLine label="Language" value={stepResult.snapshot.language} />
                      <ResultLine label="Configured runtime" value={stepResult.snapshot.configuredRuntime} />
                      <ResultLine label="Auth state" value={stepResult.snapshot.authenticationState} />
                      <ResultLine label="Knowledge eligible" value={stepResult.snapshot.knowledgeEligible ? "true" : "false"} />
                      <ResultLine label="Transfer state" value={stepResult.snapshot.transferState} />
                      <ResultLine label="Callback state" value={stepResult.snapshot.callbackState} />
                      <ResultLine label="Knowledge scope" value={stepResult.snapshot.knowledgeScope} />
                    </div>
                    {stepResult.issues.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                        <div className="font-semibold">Step issues</div>
                        {stepResult.issues.map(issue => (
                          <div key={issue} className="text-sm">
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}
                    <details className="rounded-xl border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Technical snapshot</summary>
                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <div>previousNodeId: {stepResult.snapshot.previousNodeId ?? "none"}</div>
                        <div>currentNodeType: {stepResult.snapshot.currentNodeType ?? "none"}</div>
                        <div>matchedRoute: {stepResult.snapshot.matchedRoute ?? "none"}</div>
                        <div>nextNodeId: {stepResult.snapshot.nextNodeId ?? "none"}</div>
                        <div>toolEligibility: {stepResult.snapshot.toolEligibility ?? "none"}</div>
                        <div>toolDryRunResult: {stepResult.snapshot.toolDryRunResult ?? "none"}</div>
                        <div>
                          runtimeReason: {stepResult.snapshot.runtimeReasonCode ?? "none"}
                          {stepResult.snapshot.runtimeReasonText ? ` · ${stepResult.snapshot.runtimeReasonText}` : ""}
                        </div>
                        <div className="break-words">collectedFields: {JSON.stringify(stepResult.snapshot.collectedFields)}</div>
                      </div>
                    </details>
                  </div>
                )}

                {stepResult?.snapshot.currentNodeId && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-0 text-left text-slate-600 hover:text-slate-900"
                    onClick={() => onFocusNode?.(stepResult.snapshot.currentNodeId ?? "")}
                  >
                    Focus current node
                  </Button>
                )}
              </div>
            </section>
          );
        })}

        {result?.status && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">Scenario result</div>
              <Badge variant={badgeVariant(result.status)}>{scenarioStatus ?? "INCOMPLETE"}</Badge>
            </div>
            {result.steps?.length ? (
              <p className="mt-2 text-sm text-slate-600">
                {result.steps.filter(step => step.status === "PASS").length} passing, {result.steps.filter(step => step.status === "FAIL").length} failing, {result.steps.filter(step => step.status === "INCOMPLETE").length} incomplete.
              </p>
            ) : null}
          </div>
        )}

        {result?.validation?.issues?.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Validation issues</div>
            <div className="mt-3 space-y-2">
              {result.validation.issues.map(issue => (
                <IssueCard key={`${issue.code}-${issue.nodeId ?? "global"}-${issue.message}`} issue={issue} onFocusNode={onFocusNode} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function createStep(index: number): ScenarioStepDraft {
  return {
    id: `${STEP_ID_PREFIX}-${index}-${Date.now()}`,
    callerInput: "",
    dtmfInput: "",
    expected: {
      expectedNodeId: "",
      expectedNodeType: "",
      expectedIntent: "",
      expectedLanguage: "",
      expectedRuntime: "",
      expectedAuthState: "",
      expectedTransferRequested: null,
      expectedCallbackState: "",
      expectedCollectedFields: "",
    },
  };
}

function buildExpectedPayload(expected: StepExpectationDraft): Record<string, unknown> | null {
  const collectedFields = parseCollectedFields(expected.expectedCollectedFields);
  const payload: Record<string, unknown> = {};
  if (expected.expectedNodeId.trim()) payload.expectedNodeId = expected.expectedNodeId.trim();
  if (expected.expectedNodeType.trim()) payload.expectedNodeType = expected.expectedNodeType.trim();
  if (expected.expectedIntent.trim()) payload.expectedIntent = expected.expectedIntent.trim();
  if (expected.expectedLanguage.trim()) payload.expectedLanguage = expected.expectedLanguage.trim();
  if (expected.expectedRuntime) payload.expectedRuntime = expected.expectedRuntime;
  if (expected.expectedAuthState) payload.expectedAuthState = expected.expectedAuthState;
  if (expected.expectedTransferRequested !== null) payload.expectedTransferRequested = expected.expectedTransferRequested;
  if (expected.expectedCallbackState) payload.expectedCallbackState = expected.expectedCallbackState;
  if (collectedFields) payload.expectedCollectedFields = collectedFields;
  return Object.keys(payload).length > 0 ? payload : null;
}

function parseCollectedFields(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        result[key] = value.trim();
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function badgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "PASS") return "default";
  if (status === "FAIL" || status === "BLOCKED") return "destructive";
  return "secondary";
}

function ResultLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="font-semibold text-slate-900">{label}:</span> {value ?? "none"}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      >
        {options.map(option => (
          <option key={option || "blank"} value={option}>
            {option || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

function IssueCard({ issue, onFocusNode }: { issue: ValidationIssue; onFocusNode?: (nodeId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => issue.nodeId && onFocusNode?.(issue.nodeId)}
      className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-2">
        <Badge variant={issue.severity === "ERROR" ? "destructive" : "secondary"}>{issue.severity}</Badge>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{issue.category ?? "general"}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{issue.title ?? issue.code}</div>
      <div className="mt-1 text-sm text-slate-600">{issue.description ?? issue.message}</div>
      {issue.suggestedFix && <div className="mt-2 text-xs text-slate-500">Suggested fix: {issue.suggestedFix}</div>}
      {issue.nodeId && <div className="mt-1 text-xs text-slate-500">Node: {issue.nodeId}</div>}
    </button>
  );
}

function updateExpected<T extends keyof StepExpectationDraft>(
  index: number,
  key: T,
  value: StepExpectationDraft[T],
  updateStep: (index: number, updater: (draft: ScenarioStepDraft) => ScenarioStepDraft) => void
): void {
  updateStep(index, draft => ({
    ...draft,
    expected: {
      ...draft.expected,
      [key]: value,
    },
  }));
}

function prettyFieldName(field: string): string {
  return field
    .replace(/^expected/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\./g, " › ")
    .trim()
    .replace(/^./, character => character.toUpperCase());
}

function formatComparisonValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "none";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
