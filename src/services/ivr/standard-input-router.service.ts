export type StandardInputMode = "VOICE" | "DTMF";

export interface StandardFlowNode {
  id: string;
  data?: Record<string, unknown>;
}

export interface StandardFlowEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: Record<string, unknown>;
}

export interface StandardInputRoute {
  matched: boolean;
  confidence: number;
  resultingNodeId: string | null;
  transition: string | null;
  action: "CLARIFY" | "NAVIGATE" | "REPEAT" | "GO_BACK" | "MAIN_MENU";
  optionLabel: string | null;
}

interface MenuOption {
  label: string;
  digit: string | null;
  phrases: string[];
  destinationNodeId: string | null;
}

export function routeStandardInput(input: {
  nodes: StandardFlowNode[];
  edges: StandardFlowEdge[];
  currentNodeId: string;
  inputMode: StandardInputMode;
  rawInput: string;
  previousNodeId?: string | null;
}): StandardInputRoute {
  const value = input.rawInput.trim().toLowerCase();
  const current = input.nodes.find(node => node.id === input.currentNodeId);

  if (!current || !value) {
    return clarify();
  }

  const navigation = resolveNavigation(value, input);
  if (navigation) return navigation;

  const options = readOptions(current.data);
  const matched = input.inputMode === "DTMF"
    ? options.find(option => option.digit === value)
    : options.find(option => option.phrases.some(phrase => phrase === value)) ??
      options.find(option => option.phrases.some(phrase => value.includes(phrase) || phrase.includes(value)));

  const confidence =
    matched
      ? input.inputMode === "DTMF"
        ? 1
        : matched.digit && matched.digit === value
          ? 1
          : matched.label.toLowerCase() === value
            ? 1
            : 0.9
      : 0;

  if (
    !matched ||
    (
      input.inputMode === "VOICE" &&
      confidence < 0.95 &&
      looksLikeQuestion(value) &&
      isEscapeEnabled(current.data)
    )
  ) {
    const escape = resolveNaturalLanguageEscape(
      current.data,
      input,
      value
    );

    if (escape) {
      return escape;
    }

    return clarify();
  }

  const routeDigit = (matched.digit ?? matched.label).toLowerCase();
  const edge = input.edges.find(edge =>
    edge.source === current.id &&
    String(edge.data?.trigger ?? "").trim().toUpperCase() === "DTMF" &&
    String(edge.sourceHandle ?? "").trim().toLowerCase() === routeDigit &&
    String(edge.data?.value ?? "").trim().toLowerCase() === routeDigit &&
    edge.target === matched.destinationNodeId
  ) ?? input.edges.find(edge =>
    edge.source === current.id &&
    String(edge.data?.value ?? "").trim().toLowerCase() === routeDigit
  );

  return {
    matched: true,
    confidence,
    resultingNodeId: matched.destinationNodeId ?? edge?.target ?? null,
    transition: edge?.data?.trigger ? String(edge.data.trigger) : "MENU_OPTION",
    action: "NAVIGATE",
    optionLabel: matched.label,
  };
}

function readOptions(data: Record<string, unknown> | undefined): MenuOption[] {
  const runtimeMenu = isRecord(data?.runtimeMenu) ? data.runtimeMenu : null;
  const options = Array.isArray(data?.options)
    ? data.options
    : Array.isArray(data?.menuOptions)
      ? data.menuOptions
      : Array.isArray(runtimeMenu?.options)
        ? runtimeMenu.options
        : [];
  return options.flatMap(value => {
    if (!isRecord(value) || typeof value.label !== "string") return [];
    const phrases = Array.isArray(value.voicePhrases) ? value.voicePhrases : value.phrases;
    return [{
      label: value.label.trim(),
      // Legacy saved menus may still carry `dtmf`; the canonical runtime
      // representation is `digit` and all new writes use it.
      digit: typeof value.digit === "string"
        ? value.digit.trim().toLowerCase()
        : typeof value.dtmf === "string"
          ? value.dtmf.trim().toLowerCase()
          : null,
      phrases: [value.label, ...(Array.isArray(phrases) ? phrases : [])]
        .filter((phrase): phrase is string => typeof phrase === "string" && Boolean(phrase.trim()))
        .map(phrase => phrase.trim().toLowerCase()),
      destinationNodeId: typeof value.destinationNodeId === "string" ? value.destinationNodeId : null,
    }];
  });
}

function resolveNavigation(value: string, input: { nodes: StandardFlowNode[]; previousNodeId?: string | null }): StandardInputRoute | null {
  if (value === "repeat") return { matched: true, confidence: 1, resultingNodeId: null, transition: "REPEAT", action: "REPEAT", optionLabel: null };
  if (value === "back" || value === "go back") return { matched: Boolean(input.previousNodeId), confidence: 1, resultingNodeId: input.previousNodeId ?? null, transition: "GO_BACK", action: "GO_BACK", optionLabel: null };
  if (value === "main menu") {
    const start = input.nodes.find(node => String(node.data?.nodeKind ?? "").toUpperCase() === "START");
    return { matched: Boolean(start), confidence: 1, resultingNodeId: start?.id ?? null, transition: "MAIN_MENU", action: "MAIN_MENU", optionLabel: null };
  }
  return null;
}

function resolveNaturalLanguageEscape(
  data: Record<string, unknown> | undefined,
  input: {
    nodes: StandardFlowNode[];
    currentNodeId: string;
    inputMode: StandardInputMode;
    rawInput: string;
  },
  normalizedValue: string
): StandardInputRoute | null {
  if (input.inputMode !== "VOICE") {
    return null;
  }

  if (!isEscapeEnabled(data) || !looksLikeQuestion(normalizedValue)) {
    return null;
  }

  const escapeNodeId =
    stringValue(data?.escapeNodeId) ??
    stringValue(data?.fallbackNodeId) ??
    stringValue(data?.escapeTargetNodeId);

  if (!escapeNodeId) {
    return null;
  }

  if (!looksLikeQuestion(normalizedValue)) {
    return null;
  }

  const escapeNode = input.nodes.find(node => node.id === escapeNodeId);
  if (!escapeNode) {
    return null;
  }

  return {
    matched: true,
    confidence: 0.82,
    resultingNodeId: escapeNodeId,
    transition: "NATURAL_LANGUAGE_ESCAPE",
    action: "NAVIGATE",
    optionLabel: null,
  };
}

function clarify(): StandardInputRoute {
  return { matched: false, confidence: 0, resultingNodeId: null, transition: null, action: "CLARIFY", optionLabel: null };
}

function looksLikeQuestion(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value.includes("?")) {
    return true;
  }

  return /\b(what|how|why|when|where|which|who|need|needs|documents?|help|information|info|loan|account|balance|rate)\b/.test(
    value
  );
}

function isEscapeEnabled(data: Record<string, unknown> | undefined): boolean {
  return Boolean(data?.allowNaturalLanguageEscape) ||
    Boolean(data?.naturalLanguageEscapeEnabled);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
