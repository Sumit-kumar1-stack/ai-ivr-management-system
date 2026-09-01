import { normalizeConversationalEscapeConfig, normalizeNavigationConfig } from "./ivr-runtime-menu.service";

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
  navigationHistory?: string[];
}): StandardInputRoute {
  const value = input.rawInput.trim().toLowerCase();
  const current = input.nodes.find(node => node.id === input.currentNodeId);

  if (!current || !value) {
    return clarify();
  }

  // 1. First precedence: Current menu configured option / alias (Exact then Safe Fuzzy)
  const options = readOptions(current.data);
  const exactMatch = input.inputMode === "DTMF"
    ? options.find(option => option.digit === value)
    : options.find(option => option.phrases.some(phrase => phrase === value));

  const fuzzyMatch = input.inputMode === "VOICE" && !exactMatch
    ? options.find(option => option.phrases.some(phrase => value.includes(phrase) || phrase.includes(value)))
    : null;

  if (exactMatch) {
    const routeDigit = (exactMatch.digit ?? exactMatch.label).toLowerCase();
    const edge = input.edges.find(edge =>
      edge.source === current.id &&
      String(edge.data?.trigger ?? "").trim().toUpperCase() === "DTMF" &&
      String(edge.sourceHandle ?? "").trim().toLowerCase() === routeDigit &&
      edge.target === exactMatch.destinationNodeId
    ) ?? input.edges.find(edge =>
      edge.source === current.id &&
      String(edge.data?.value ?? "").trim().toLowerCase() === routeDigit
    );

    const isRepeatOption =
      exactMatch.label.toLowerCase().includes("repeat") ||
      (exactMatch.destinationNodeId === current.id && exactMatch.label.toLowerCase().includes("repeat"));

    return {
      matched: true,
      confidence: 1,
      resultingNodeId: exactMatch.destinationNodeId ?? edge?.target ?? null,
      transition: isRepeatOption ? "REPEAT" : (edge?.data?.trigger ? String(edge.data.trigger) : "MENU_OPTION"),
      action: isRepeatOption ? "REPEAT" : "NAVIGATE",
      optionLabel: exactMatch.label,
    };
  }

  if (fuzzyMatch) {
    const routeDigit = (fuzzyMatch.digit ?? fuzzyMatch.label).toLowerCase();
    const edge = input.edges.find(edge =>
      edge.source === current.id &&
      String(edge.data?.trigger ?? "").trim().toUpperCase() === "DTMF" &&
      String(edge.sourceHandle ?? "").trim().toLowerCase() === routeDigit &&
      edge.target === fuzzyMatch.destinationNodeId
    ) ?? input.edges.find(edge =>
      edge.source === current.id &&
      String(edge.data?.value ?? "").trim().toLowerCase() === routeDigit
    );

    return {
      matched: true,
      confidence: 0.9,
      resultingNodeId: fuzzyMatch.destinationNodeId ?? edge?.target ?? null,
      transition: edge?.data?.trigger ? String(edge.data.trigger) : "MENU_OPTION",
      action: "NAVIGATE",
      optionLabel: fuzzyMatch.label,
    };
  }

  // 2. Second precedence: Enabled semantic navigation command (HOME, BACK, REPEAT, END)
  const navigation = resolveNavigation(value, input, current);
  if (navigation) return navigation;

  // 3. Third precedence: Conversational Escape (speech only, non-DTMF, meaningful conversational utterance)
  if (input.inputMode === "VOICE" && !/^[0-9*#]$/.test(value)) {
    const escape = resolveConversationalEscape(
      current.data,
      input,
      value
    );

    if (escape) {
      return escape;
    }
  }

  return clarify();
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

function resolveNavigation(
  value: string,
  input: {
    nodes: StandardFlowNode[];
    currentNodeId: string;
    inputMode: StandardInputMode;
    previousNodeId?: string | null;
    navigationHistory?: string[];
  },
  currentNode: StandardFlowNode
): StandardInputRoute | null {
  const startNode = input.nodes.find(node => String(node.data?.nodeKind ?? "").toUpperCase() === "START");
  const navConfig = normalizeNavigationConfig(currentNode.data) ?? normalizeNavigationConfig(startNode?.data);

  if (navConfig) {
    // HOME
    if (navConfig.home.enabled) {
      const isHomeMatch = input.inputMode === "DTMF"
        ? navConfig.home.digits.includes(value)
        : navConfig.home.phrases.some(phrase => phrase === value || value.includes(phrase) || phrase.includes(value));

      if (isHomeMatch) {
        const homeTarget = [
          navConfig.home.targetNodeId,
          startNode?.data?.mainMenuNodeId,
          startNode?.data?.homeNodeId,
        ].find((id): id is string => typeof id === "string" && input.nodes.some(n => n.id === id.trim())) ?? startNode?.id ?? null;

        return {
          matched: Boolean(homeTarget),
          confidence: 1,
          resultingNodeId: homeTarget,
          transition: "HOME",
          action: "MAIN_MENU",
          optionLabel: "Home",
        };
      }
    }

    // BACK
    if (navConfig.back.enabled) {
      const isBackMatch = input.inputMode === "DTMF"
        ? navConfig.back.digits.includes(value)
        : navConfig.back.phrases.some(phrase => phrase === value || value.includes(phrase) || phrase.includes(value));

      if (isBackMatch) {
        const historyCandidate = [...(input.navigationHistory ?? [])]
          .reverse()
          .find(id => id !== input.currentNodeId && input.nodes.some(n => n.id === id));

        const validPrevious = input.previousNodeId && input.nodes.some(n => n.id === input.previousNodeId)
          ? input.previousNodeId
          : null;
        const fallbackTarget = [
          navConfig.home.targetNodeId,
          startNode?.data?.mainMenuNodeId,
          startNode?.data?.homeNodeId,
        ].find((id): id is string => typeof id === "string" && input.nodes.some(n => n.id === id.trim())) ?? input.currentNodeId;

        const targetNodeId = historyCandidate ?? validPrevious ?? fallbackTarget;
        return {
          matched: Boolean(targetNodeId),
          confidence: 1,
          resultingNodeId: targetNodeId,
          transition: "GO_BACK",
          action: "GO_BACK",
          optionLabel: "Back",
        };
      }
    }

    // REPEAT
    if (navConfig.repeat.enabled) {
      const isRepeatMatch = input.inputMode === "DTMF"
        ? navConfig.repeat.digits.includes(value)
        : navConfig.repeat.phrases.some(phrase => phrase === value || value.includes(phrase) || phrase.includes(value));

      if (isRepeatMatch) {
        return {
          matched: true,
          confidence: 1,
          resultingNodeId: input.currentNodeId,
          transition: "REPEAT",
          action: "REPEAT",
          optionLabel: "Repeat",
        };
      }
    }

    // END
    if (navConfig.end.enabled) {
      const isEndMatch = input.inputMode === "DTMF"
        ? navConfig.end.digits.includes(value)
        : navConfig.end.phrases.some(phrase => phrase === value || value.includes(phrase) || phrase.includes(value));

      if (isEndMatch) {
        const endNode = input.nodes.find(n => String(n.data?.nodeKind ?? "").toUpperCase() === "END_CALL");
        return {
          matched: true,
          confidence: 1,
          resultingNodeId: endNode?.id ?? null,
          transition: "END_CALL",
          action: "NAVIGATE",
          optionLabel: "End Call",
        };
      }
    }

    return null;
  }

  // Legacy unconfigured fallback for voice phrases
  if (input.inputMode === "VOICE") {
    if (value === "repeat" || value === "repeat that" || value === "say that again" || value === "repeat options" || value === "repeat menu") {
      return { matched: true, confidence: 1, resultingNodeId: null, transition: "REPEAT", action: "REPEAT", optionLabel: null };
    }
    if (value === "back" || value === "go back" || value === "previous menu") {
      const historyCandidate = [...(input.navigationHistory ?? [])]
        .reverse()
        .find(id => id !== input.currentNodeId && input.nodes.some(n => n.id === id));
      const validPrevious = input.previousNodeId && input.nodes.some(n => n.id === input.previousNodeId)
        ? input.previousNodeId
        : null;
      const targetNodeId = historyCandidate ?? validPrevious;
      return {
        matched: Boolean(targetNodeId),
        confidence: 1,
        resultingNodeId: targetNodeId,
        transition: "GO_BACK",
        action: "GO_BACK",
        optionLabel: null,
      };
    }
    if (value === "main menu") {
      const homeTarget = [
        startNode?.data?.mainMenuNodeId,
        startNode?.data?.homeNodeId,
      ].find((id): id is string => typeof id === "string" && input.nodes.some(n => n.id === id.trim())) ?? startNode?.id ?? null;
      return {
        matched: Boolean(homeTarget),
        confidence: 1,
        resultingNodeId: homeTarget,
        transition: "MAIN_MENU",
        action: "MAIN_MENU",
        optionLabel: null,
      };
    }
  }

  return null;
}

const FILLER_AND_NOISE_WORDS = new Set([
  "uh", "um", "er", "ah", "hmm", "hm", "huh", "mhm", "uh-huh", "uh huh",
  "ok", "okay", "yes", "no", "yeah", "nope", "yep", "hi", "hey", "hello",
  "bye", "goodbye", "thanks", "thank you", "xyz", "abc", "asdf",
  "[noise]", "[silence]", "[laughter]", "[music]", "[applause]", "[cough]",
  "<noise>", "<silence>", "noise", "silence"
]);

export function isMeaningfulConversationalUtterance(rawInput: string): boolean {
  if (!rawInput) return false;
  const normalized = rawInput.trim().toLowerCase();
  if (normalized.length < 3) return false;

  // Clean noise markers and extract alphanumeric tokens
  const cleanText = normalized.replace(/[^\w\s?]/g, " ").trim();
  const tokens = cleanText.split(/\s+/).filter(Boolean);

  // Reject single-token utterances or empty token lists
  if (tokens.length < 2) return false;

  // Filter out fillers and noise tokens
  const nonFillerTokens = tokens.filter(t => !FILLER_AND_NOISE_WORDS.has(t));
  if (nonFillerTokens.length < 2) return false;

  // 1. Direct question mark with at least 2 non-filler tokens
  if (rawInput.includes("?")) {
    return true;
  }

  // 2. Interrogative sentence structures (what, when, where, why, how, can, is, etc.)
  const hasInterrogative = /\b(what|when|where|why|how|which|who|whom|whose|can|could|would|should|is|are|do|does|did|will)\b/.test(cleanText);
  if (hasInterrogative && tokens.length >= 3) {
    return true;
  }

  // 3. Conversational / informational request phrases
  const hasInformationalIntent = /\b(need|information|info|tell|explain|details|help|inquire|inquiry|hours|timing|schedule|requirement|requirements|documents|eligibility|status|available|availability|contact|support|policy|rates?|loans?|account|balance)\b/.test(cleanText);
  if (hasInformationalIntent && tokens.length >= 3) {
    return true;
  }

  // 4. Sufficiently long descriptive statement (>= 4 non-filler words)
  if (nonFillerTokens.length >= 4) {
    return true;
  }

  return false;
}

function resolveConversationalEscape(
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

  // DTMF digits must NEVER trigger Conversational Escape
  if (/^[0-9*#]$/.test(normalizedValue)) {
    return null;
  }

  const escapeConfig = normalizeConversationalEscapeConfig(data);
  if (!escapeConfig?.enabled || !escapeConfig.targetNodeId) {
    return null;
  }

  const targetNode = input.nodes.find(node => node.id === escapeConfig.targetNodeId);
  if (!targetNode) {
    return null;
  }

  if (!isMeaningfulConversationalUtterance(input.rawInput)) {
    return null;
  }

  const isLegacy = !isRecord(data?.conversationalEscape) && (Boolean(data?.allowNaturalLanguageEscape) || Boolean(data?.naturalLanguageEscapeEnabled));
  const transition = isLegacy ? "NATURAL_LANGUAGE_ESCAPE" : "CONVERSATIONAL_ESCAPE";

  return {
    matched: true,
    confidence: 0.85,
    resultingNodeId: escapeConfig.targetNodeId,
    transition,
    action: "NAVIGATE",
    optionLabel: "Conversational Escape",
  };
}

function clarify(): StandardInputRoute {
  return { matched: false, confidence: 0, resultingNodeId: null, transition: null, action: "CLARIFY", optionLabel: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
