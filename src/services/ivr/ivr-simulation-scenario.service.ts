import { validateIVRFlowDefinition, type IVRFlowValidationIssue, type IVRFlowValidationResult } from "./ivr-flow-validator.service";
import { selectRuntime } from "./ivr-runtime-selector.service";
import { simulateIVRFlow, type IVRSimulationResult } from "./ivr-simulator.service";

type Node = {
  id: string;
  data?: Record<string, unknown>;
};

type Edge = {
  source: string;
  target: string;
  data?: Record<string, unknown>;
};

export interface IVRSimulationExpectation {
  expectedNodeId?: string | null;
  expectedNodeType?: string | null;
  expectedIntent?: string | null;
  expectedLanguage?: string | null;
  expectedRuntime?: "STANDARD" | "PREMIUM" | null;
  expectedAuthState?: "UNKNOWN" | "PASS" | "FAIL" | "NOT_REQUIRED" | null;
  expectedTransferRequested?: boolean | null;
  expectedCallbackState?: "NOT_REQUESTED" | "REQUESTED" | "SCHEDULED" | "UNAVAILABLE" | null;
  expectedCollectedFields?: Record<string, string>;
}

export interface IVRSimulationStep {
  id: string;
  callerInput?: string;
  dtmfInput?: string;
  expected?: IVRSimulationExpectation;
}

export interface IVRSimulationScenario {
  id?: string;
  name: string;
  description?: string;
  steps: IVRSimulationStep[];
}

export interface IVRSimulationStepSnapshot {
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
  runtimeReasonCode: string | null;
  runtimeReasonText: string | null;
}

export interface IVRSimulationExpectationComparison {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface IVRSimulationStepResult {
  id: string;
  status: "PASS" | "FAIL" | "INCOMPLETE";
  expectation: IVRSimulationExpectation | null;
  comparisons: IVRSimulationExpectationComparison[];
  snapshot: IVRSimulationStepSnapshot;
  issues: string[];
  validationIssues: IVRFlowValidationIssue[];
  engine: IVRSimulationResult;
}

export interface IVRSimulationScenarioResult {
  validation: IVRFlowValidationResult;
  status: "PASS" | "FAIL" | "INCOMPLETE";
  blocked: boolean;
  blockedIssues: IVRFlowValidationIssue[];
  scenario: IVRSimulationScenario;
  steps: IVRSimulationStepResult[];
}

export function runIVRSimulationScenario(input: {
  nodes: unknown[];
  edges: unknown[];
  scenario: IVRSimulationScenario;
  tenantId?: string | null;
  provider?: string | null;
}): IVRSimulationScenarioResult {
  const validation = validateIVRFlowDefinition({
    nodes: input.nodes,
    edges: input.edges,
    tenantId: input.tenantId ?? null,
    provider: input.provider ?? null,
  });

  const blockedIssues = validation.errors.filter(isBlockingSimulationIssue);
  if (blockedIssues.length > 0) {
    return {
      validation,
      status: "INCOMPLETE",
      blocked: true,
      blockedIssues,
      scenario: normalizeScenario(input.scenario),
      steps: [],
    };
  }

  const nodes = normalizeNodes(input.nodes);
  const edges = normalizeEdges(input.edges);
  const scenario = normalizeScenario(input.scenario);
  const state = createScenarioState(nodes, edges, input.tenantId ?? null, input.provider ?? null);
  const results: IVRSimulationStepResult[] = [];
  let overall: "PASS" | "FAIL" | "INCOMPLETE" = "PASS";

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    const engine = simulateIVRFlow({
      nodes,
      edges,
      currentNodeId: state.currentNodeId,
      startNodeId: state.currentNodeId ? null : state.startNodeId,
      inputMode: step.dtmfInput ? "DTMF" : step.callerInput ? "VOICE" : "SILENCE",
      input: step.dtmfInput ?? step.callerInput ?? "",
      tenantId: input.tenantId ?? null,
    });

    const currentNode = engine.resultingNodeId
      ? nodes.find(node => node.id === engine.resultingNodeId) ?? null
      : state.currentNodeId
        ? nodes.find(node => node.id === state.currentNodeId) ?? null
        : null;

    const snapshot = buildSnapshot({
      stepNumber: index + 1,
      step,
      engine,
      previousNodeId: state.currentNodeId,
      currentNode,
      state,
    });

    const expectationResult = compareExpectation(step.expected ?? null, snapshot);
    const status = expectationResult.status;
    const issues = [...engine.warnings, ...expectationResult.issues];

    results.push({
      id: step.id,
      status,
      expectation: step.expected ?? null,
      comparisons: expectationResult.comparisons,
      snapshot,
      issues,
      validationIssues: validation.issues,
      engine,
    });

    state.previousNodeId = state.currentNodeId;
    state.currentNodeId = snapshot.currentNodeId;
    state.selectedIntent = snapshot.detectedIntent ?? state.selectedIntent;
    state.preferredLanguage = snapshot.language ?? state.preferredLanguage;
    state.selectedRuntime = snapshot.selectedRuntime ?? state.selectedRuntime;
    state.runtimeReasonCode = snapshot.runtimeReasonCode ?? state.runtimeReasonCode;
    state.runtimeReasonText = snapshot.runtimeReasonText ?? state.runtimeReasonText;
    state.collectedFields = { ...state.collectedFields, ...snapshot.collectedFields };
    state.authenticationState = snapshot.authenticationState;
    state.transferState = snapshot.transferState;
    state.callbackState = snapshot.callbackState;
    state.knowledgeScope = snapshot.knowledgeScope ?? state.knowledgeScope;
    state.toolEligibility = snapshot.toolEligibility ?? state.toolEligibility;
    state.toolDryRunResult = snapshot.toolDryRunResult ?? state.toolDryRunResult;
    state.nextNodeId = snapshot.nextNodeId;

    if (status === "FAIL") {
      overall = "FAIL";
    } else if (status === "INCOMPLETE" && overall === "PASS") {
      overall = "INCOMPLETE";
    }
  }

  return {
    validation,
    status: results.length === 0 ? "INCOMPLETE" : overall,
    blocked: false,
    blockedIssues: [],
    scenario,
    steps: results,
  };
}

interface ScenarioState {
  startNodeId: string | null;
  currentNodeId: string | null;
  previousNodeId: string | null;
  selectedIntent: string | null;
  preferredLanguage: string | null;
  configuredRuntime: "STANDARD" | "PREMIUM" | "AUTO" | null;
  selectedRuntime: "STANDARD" | "PREMIUM" | null;
  runtimeReasonCode: string | null;
  runtimeReasonText: string | null;
  authenticationState: "UNKNOWN" | "PASS" | "FAIL" | "NOT_REQUIRED";
  collectedFields: Record<string, string>;
  knowledgeScope: string | null;
  toolEligibility: string | null;
  toolDryRunResult: string | null;
  transferState: "NOT_REQUESTED" | "REQUESTED" | "DRY_RUN" | "UNAVAILABLE";
  callbackState: "NOT_REQUESTED" | "REQUESTED" | "DRY_RUN" | "SCHEDULED" | "UNAVAILABLE";
  nextNodeId: string | null;
}

function createScenarioState(nodes: Node[], edges: Edge[], tenantId: string | null, provider: string | null): ScenarioState {
  const startNode = nodes.find(node => kind(node) === "START") ?? null;
  const runtimeSelection = startNode
    ? selectRuntime({
        tenant: {
          tenantId,
          premiumVoiceEnabled: false,
        },
        provider,
        flow: {
          id: null,
          versionId: null,
          runtimeMode: runtimeModeLabel(startNode.data?.runtimeMode),
          runtimeDefault: normalizeRuntimeChoice(startNode.data?.runtimeDefault),
          nodes,
        },
        profile: {
          voiceRuntime: null,
          defaultRuntime: normalizeRuntimeChoice(startNode.data?.runtimeDefault),
        },
        policy: {
          defaultRuntime: normalizeRuntimeChoice(startNode.data?.runtimeDefault) ?? "STANDARD",
          useCase: "UNKNOWN",
          complexityTier: nodes.length >= 8 ? "HIGH" : nodes.length >= 4 ? "MEDIUM" : "LOW",
        },
      })
    : null;

  const selectedRuntime = runtimeSelection?.selectedRuntime ?? normalizeRuntimeChoice(startNode?.data?.runtimeDefault) ?? null;

  return {
    startNodeId: startNode?.id ?? null,
    currentNodeId: startNode?.id ?? null,
    previousNodeId: null,
    selectedIntent: null,
    preferredLanguage: null,
    configuredRuntime: runtimeModeLabel(startNode?.data?.runtimeMode),
    selectedRuntime,
    runtimeReasonCode: runtimeSelection?.reasonCode ?? null,
    runtimeReasonText: runtimeSelection?.reasonText ?? null,
    authenticationState: "UNKNOWN",
    collectedFields: {},
    knowledgeScope: null,
    toolEligibility: null,
    toolDryRunResult: null,
    transferState: "NOT_REQUESTED",
    callbackState: "NOT_REQUESTED",
    nextNodeId: null,
  };
}

function buildSnapshot(input: {
  stepNumber: number;
  step: IVRSimulationStep;
  engine: IVRSimulationResult;
  previousNodeId: string | null;
  currentNode: Node | null;
  state: ScenarioState;
}): IVRSimulationStepSnapshot {
  const inputText = input.step.callerInput?.trim() ?? null;
  const dtmfText = input.step.dtmfInput?.trim() ?? null;
  const nodeKind = kind(input.currentNode);
  const currentNodeId = input.engine.resultingNodeId ?? input.currentNode?.id ?? input.state.currentNodeId;
  const nextNodeId = input.engine.resultingNodeId && input.engine.resultingNodeId !== input.state.currentNodeId ? input.engine.resultingNodeId : null;
  const detectedIntent = inferIntent(inputText, dtmfText, input.currentNode);
  const language = inferLanguage(inputText, input.currentNode, input.state.preferredLanguage);
  const auth = inferAuthenticationState(input.currentNode, inputText, dtmfText);
  const configuredRuntime = input.state.configuredRuntime ?? runtimeModeLabel(input.currentNode?.data?.runtimeMode) ?? null;
  const knowledgeEligible = Boolean(nodeKind === "KNOWLEDGE" || toStringArray(input.currentNode?.data?.knowledgeDocumentIds ?? input.currentNode?.data?.knowledgeIds ?? input.currentNode?.data?.knowledge).length > 0);
  const knowledgeScope = nodeKind === "KNOWLEDGE" ? summarizeKnowledge(input.currentNode) : input.state.knowledgeScope;
  const toolEligibility = inferToolEligibility(input.currentNode);
  const toolDryRunResult = inferToolDryRunResult(input.currentNode, toolEligibility, auth);
  const transferState = nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER"
    ? toolDryRunResult === "SIMULATION_UNAVAILABLE_FOR_TOOL"
      ? "UNAVAILABLE"
      : "DRY_RUN"
    : input.state.transferState;
  const callbackState = nodeKind === "CALLBACK"
    ? toolDryRunResult === "SIMULATION_UNAVAILABLE_FOR_TOOL"
      ? "UNAVAILABLE"
      : "DRY_RUN"
    : input.state.callbackState;
  const collectedFields = collectFields(input.currentNode, inputText, dtmfText, input.state.collectedFields);

  return {
    stepNumber: input.stepNumber,
    callerInput: inputText,
    dtmfInput: dtmfText,
    previousNodeId: input.previousNodeId,
    currentNodeId,
    currentNodeType: nodeKind || null,
    matchedRoute: input.engine.transition,
    detectedIntent,
    language,
    configuredRuntime,
    selectedRuntime: input.state.selectedRuntime,
    knowledgeEligible,
    authenticationState: auth,
    collectedFields,
    knowledgeScope,
    toolEligibility,
    toolDryRunResult,
    transferState,
    callbackState,
    nextNodeId,
    warnings: [...input.engine.warnings],
    runtimeReasonCode: input.state.runtimeReasonCode,
    runtimeReasonText: input.state.runtimeReasonText,
  };
}

function compareExpectation(expected: IVRSimulationExpectation | null, snapshot: IVRSimulationStepSnapshot): {
  status: "PASS" | "FAIL" | "INCOMPLETE";
  issues: string[];
  comparisons: IVRSimulationExpectationComparison[];
} {
  if (!expected) {
    return {
      status: "PASS",
      issues: [],
      comparisons: [],
    };
  }

  const issues: string[] = [];
  const comparisons: IVRSimulationExpectationComparison[] = [];
  const incomplete = hasUnsupportedRequiredState(snapshot);

  compareField("expectedNodeId", expected.expectedNodeId ?? null, snapshot.currentNodeId, comparisons, issues, value => `Expected node ${String(value)} but reached ${snapshot.currentNodeId ?? "none"}.`);
  compareField("expectedNodeType", expected.expectedNodeType ?? null, snapshot.currentNodeType, comparisons, issues, value => `Expected node type ${String(value)} but reached ${snapshot.currentNodeType ?? "none"}.`, normalizeToken);
  compareField("expectedIntent", expected.expectedIntent ?? null, snapshot.detectedIntent, comparisons, issues, value => `Expected intent ${String(value)} but detected ${snapshot.detectedIntent ?? "none"}.`, normalizeToken);
  compareField("expectedLanguage", expected.expectedLanguage ?? null, snapshot.language, comparisons, issues, value => `Expected language ${String(value)} but detected ${snapshot.language ?? "none"}.`, normalizeToken);
  compareField("expectedRuntime", expected.expectedRuntime ?? null, snapshot.selectedRuntime, comparisons, issues, value => `Expected runtime ${String(value)} but resolved ${snapshot.selectedRuntime ?? "none"}.`);
  compareField("expectedAuthState", expected.expectedAuthState ?? null, snapshot.authenticationState, comparisons, issues, value => `Expected auth state ${String(value)} but got ${snapshot.authenticationState}.`);
  if (typeof expected.expectedTransferRequested === "boolean") {
    const transferRequested = snapshot.transferState === "REQUESTED" || snapshot.transferState === "DRY_RUN";
    comparisons.push({ field: "expectedTransferRequested", expected: expected.expectedTransferRequested, actual: transferRequested, passed: expected.expectedTransferRequested === transferRequested });
    if (expected.expectedTransferRequested !== transferRequested) issues.push(`Expected transferRequested=${String(expected.expectedTransferRequested)} but got ${String(transferRequested)}.`);
  }
  compareField("expectedCallbackState", expected.expectedCallbackState ?? null, snapshot.callbackState, comparisons, issues, value => `Expected callback state ${String(value)} but got ${snapshot.callbackState}.`, normalizeToken);
  if (expected.expectedCollectedFields) {
    for (const [key, value] of Object.entries(expected.expectedCollectedFields)) {
      const actual = snapshot.collectedFields[key] ?? null;
      const passed = actual === value;
      comparisons.push({ field: `expectedCollectedFields.${key}`, expected: value, actual, passed });
      if (!passed) issues.push(`Expected collected field ${key}=${value} but got ${actual ?? "none"}.`);
    }
  }

  if (issues.length === 0) {
    return {
      status: incomplete ? "INCOMPLETE" : "PASS",
      issues: incomplete ? ["Required simulated state was not available for a safe comparison."] : [],
      comparisons,
    };
  }

  return {
    status: incomplete ? "INCOMPLETE" : "FAIL",
    issues,
    comparisons,
  };
}

function hasUnsupportedRequiredState(snapshot: IVRSimulationStepSnapshot): boolean {
  return snapshot.toolDryRunResult === "SIMULATION_UNAVAILABLE_FOR_TOOL";
}

function compareField(
  field: string,
  expected: unknown,
  actual: unknown,
  comparisons: IVRSimulationExpectationComparison[],
  issues: string[],
  message: (expected: unknown) => string,
  normalizer?: (value: unknown) => string | null
): void {
  if (expected === null || expected === undefined || expected === "") {
    return;
  }
  const normalizedExpected = normalizer ? normalizer(expected) : expected;
  const normalizedActual = normalizer ? normalizer(actual) : actual;
  const passed = normalizedExpected === normalizedActual;
  comparisons.push({ field, expected, actual, passed });
  if (!passed) {
    issues.push(message(expected));
  }
}

function inferIntent(inputText: string | null, dtmfText: string | null, node: Node | null): string | null {
  const text = [inputText, dtmfText, stringValue(node?.data?.label), stringValue(node?.data?.prompt)].filter(Boolean).join(" ").toLowerCase();
  if (/\b(personal loan|loan)\b/.test(text)) return "PERSONAL_LOAN";
  if (/\b(balance|account balance)\b/.test(text)) return "CHECK_BALANCE";
  if (/\b(callback|call back|call me back)\b/.test(text)) return "REQUEST_CALLBACK";
  if (/\b(agent|human|representative)\b/.test(text)) return "HUMAN_AGENT";
  if (/\b(document|documents|paperwork)\b/.test(text)) return "DOCUMENTS";
  if (/\b(payment|pay|billing)\b/.test(text)) return "PAYMENT";
  const action = stringValue(node?.data?.actionCode);
  return action ? action.toUpperCase() : null;
}

function inferLanguage(inputText: string | null, node: Node | null, existing: string | null): string | null {
  const text = [inputText, stringValue(node?.data?.language), stringValue(node?.data?.prompt)].filter(Boolean).join(" ").toLowerCase();
  if (/\b(hindi|mera|mujhe|kripya|kitna|kaise)\b/.test(text)) return "hi";
  if (/\b(hinglish|yaar|please|loan|agent)\b/.test(text) && /\b(hindi|mujhe|mera)\b/.test(text)) return "hinglish";
  if (existing) return existing;
  return "en";
}

function inferAuthenticationState(node: Node | null, inputText: string | null, dtmfText: string | null): "UNKNOWN" | "PASS" | "FAIL" | "NOT_REQUIRED" {
  if (kind(node) !== "AUTH_GATE") {
    return "NOT_REQUIRED";
  }
  const text = `${inputText ?? ""} ${dtmfText ?? ""}`.trim().toLowerCase();
  if (!text) {
    return "UNKNOWN";
  }
  if (/\b(no|deny|wrong|fail|failed|incorrect)\b/.test(text)) {
    return "FAIL";
  }
  return "PASS";
}

function inferToolEligibility(node: Node | null): string | null {
  const nodeKind = kind(node);
  if (nodeKind === "KNOWLEDGE") return "READ_ONLY";
  if (nodeKind === "ACTION") return inferActionRisk(node);
  if (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER") return "MUTATING";
  if (nodeKind === "CALLBACK") return "MUTATING";
  return null;
}

function inferToolDryRunResult(node: Node | null, toolEligibility: string | null, authState: IVRSimulationStepSnapshot["authenticationState"]): string | null {
  if (!toolEligibility) return null;
  if (toolEligibility === "READ_ONLY") {
    return toStringArray(
      node?.data?.knowledgeDocumentIds ??
        node?.data?.knowledgeIds ??
        node?.data?.knowledge
    ).length > 0
      ? "DRY_RUN_OK"
      : "SIMULATION_UNAVAILABLE_FOR_TOOL";
  }
  if (toolEligibility === "MUTATING") {
    if (authState !== "PASS" && toolLooksSensitive(node)) {
      return "SIMULATION_UNAVAILABLE_FOR_TOOL";
    }
    return "DRY_RUN_ONLY";
  }
  return "SIMULATION_UNAVAILABLE_FOR_TOOL";
}

function inferActionRisk(node: Node | null): string | null {
  const explicit = stringValue(node?.data?.toolRisk) ?? stringValue(node?.data?.risk) ?? stringValue(node?.data?.businessToolRisk);
  if (explicit) {
    const token = explicit.toUpperCase();
    if (token === "READ_ONLY" || token === "MUTATING" || token === "SENSITIVE") return token;
  }
  const text = [
    stringValue(node?.data?.actionCode),
    stringValue(node?.data?.label),
    stringValue(node?.data?.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (/(SEARCH|LOOKUP|LIST|FETCH|READ|VIEW|GET)/.test(text)) return "READ_ONLY";
  if (/(TRANSFER|CALLBACK|BOOK|CREATE|SEND|PAY|SMS|WHATSAPP|EMAIL|KYC|CONSENT|END CALL|END_CALL)/.test(text)) return "SENSITIVE";
  return "MUTATING";
}

function toolLooksSensitive(node: Node | null): boolean {
  const text = [
    stringValue(node?.data?.actionCode),
    stringValue(node?.data?.label),
    stringValue(node?.data?.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return /(BALANCE|ACCOUNT|PAY|PAYMENT|TRANSFER|CALLBACK|SMS|WHATSAPP|EMAIL|KYC|SENSITIVE|CONSENT)/.test(text);
}

function collectFields(node: Node | null, inputText: string | null, dtmfText: string | null, existing: Record<string, string>): Record<string, string> {
  const next = { ...existing };
  if (inputText) next.lastVoiceInput = inputText;
  if (dtmfText) next.lastDtmfInput = dtmfText;
  if (kind(node) === "AUTH_GATE" && inputText) next.authenticationAttempt = inputText;
  if (kind(node) === "CALLBACK") next.callbackRequested = "true";
  if (kind(node) === "TRANSFER" || kind(node) === "HUMAN_TRANSFER") next.transferRequested = "true";
  return next;
}

function summarizeKnowledge(node: Node | null): string | null {
  if (!node) return null;
  const ids = toStringArray(
    node.data?.knowledgeDocumentIds ??
      node.data?.knowledgeIds ??
      node.data?.knowledge
  );
  if (ids.length === 0) return "No knowledge documents attached.";
  return `${ids.length} approved knowledge document(s): ${ids.join(", ")}`;
}

function isBlockingSimulationIssue(issue: IVRFlowValidationIssue): boolean {
  return issue.severity === "ERROR";
}

function normalizeScenario(scenario: IVRSimulationScenario): IVRSimulationScenario {
  return {
    id: stringValue(scenario.id) ?? undefined,
    name: stringValue(scenario.name) ?? "Unnamed scenario",
    description: stringValue(scenario.description) ?? undefined,
    steps: Array.isArray(scenario.steps)
      ? scenario.steps.map((step, index) => ({
          id: stringValue(step.id) ?? `step-${index + 1}`,
          callerInput: stringValue(step.callerInput) ?? undefined,
          dtmfInput: stringValue(step.dtmfInput) ?? undefined,
          expected: step.expected ? {
            expectedNodeId: stringValue(step.expected.expectedNodeId),
            expectedNodeType: stringValue(step.expected.expectedNodeType),
            expectedIntent: stringValue(step.expected.expectedIntent),
            expectedLanguage: stringValue(step.expected.expectedLanguage),
            expectedRuntime: step.expected.expectedRuntime === "STANDARD" || step.expected.expectedRuntime === "PREMIUM" ? step.expected.expectedRuntime : null,
            expectedAuthState: step.expected.expectedAuthState === "UNKNOWN" || step.expected.expectedAuthState === "PASS" || step.expected.expectedAuthState === "FAIL" || step.expected.expectedAuthState === "NOT_REQUIRED" ? step.expected.expectedAuthState : null,
            expectedTransferRequested: typeof step.expected.expectedTransferRequested === "boolean" ? step.expected.expectedTransferRequested : null,
            expectedCallbackState: step.expected.expectedCallbackState === "NOT_REQUESTED" || step.expected.expectedCallbackState === "REQUESTED" || step.expected.expectedCallbackState === "SCHEDULED" || step.expected.expectedCallbackState === "UNAVAILABLE" ? step.expected.expectedCallbackState : null,
            expectedCollectedFields: isRecord(step.expected.expectedCollectedFields) ? recordOfStrings(step.expected.expectedCollectedFields) : undefined,
          } : undefined,
        }))
      : [],
  };
}

function normalizeNodes(value: unknown): Node[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map(node => ({ id: stringValue(node.id) ?? "", data: isRecord(node.data) ? sanitizeRecord(node.data) : undefined })).filter(node => Boolean(node.id))
    : [];
}

function normalizeEdges(value: unknown): Edge[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map(edge => ({ source: stringValue(edge.source) ?? "", target: stringValue(edge.target) ?? "", data: isRecord(edge.data) ? sanitizeRecord(edge.data) : undefined })).filter(edge => Boolean(edge.source) && Boolean(edge.target))
    : [];
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      record[key] = raw;
      continue;
    }
    if (Array.isArray(raw)) {
      record[key] = raw.map(item => (isRecord(item) ? sanitizeRecord(item) : item));
      continue;
    }
    if (isRecord(raw)) {
      record[key] = sanitizeRecord(raw);
    }
  }
  return record;
}

function kind(node: Node | null): string {
  return stringValue(node?.data?.nodeKind)?.toUpperCase() ?? "";
}

function runtimeModeLabel(value: unknown): "STANDARD" | "PREMIUM" | "AUTO" | null {
  const token = stringValue(value)?.toUpperCase();
  if (token === "STANDARD" || token === "PREMIUM" || token === "AUTO") return token;
  return null;
}

function normalizeRuntimeChoice(value: unknown): "STANDARD" | "PREMIUM" | null {
  const token = stringValue(value)?.toUpperCase();
  if (token === "STANDARD" || token === "PREMIUM") return token;
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => typeof item === "string" ? item.trim() : isRecord(item) && typeof item.id === "string" ? item.id.trim() : "").filter(Boolean)
    : [];
}

function recordOfStrings(value: Record<string, unknown>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) {
      next[key] = raw.trim();
    }
  }
  return next;
}

function normalizeToken(value: unknown): string {
  return stringValue(value)?.toUpperCase() ?? "";
}
