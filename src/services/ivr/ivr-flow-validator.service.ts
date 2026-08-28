import { resolveRealtimeInputCapability } from "./realtime-input-capability.service";
import { selectRuntime, type IVRRuntimeMode } from "./ivr-runtime-selector.service";

export type IVRFlowValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface IVRFlowValidationIssue {
  code: string;
  nodeId: string | null;
  edgeId: string | null;
  field: string | null;
  category: string;
  title: string;
  description: string;
  suggestedFix: string | null;
  message: string;
  severity: IVRFlowValidationSeverity;
}

export interface IVRFlowValidationResult {
  valid: boolean;
  errors: IVRFlowValidationIssue[];
  warnings: IVRFlowValidationIssue[];
  issues: IVRFlowValidationIssue[];
}

export interface ValidateIVRFlowInput {
  nodes: unknown[];
  edges: unknown[];
  tenantId?: string | null;
  tenantPremiumVoiceEnabled?: boolean;
  allowedKnowledgeDocumentIds?: string[];
  allowedActionCodes?: string[];
  allowedTransferDestinationIds?: string[];
  allowedCallbackDestinationIds?: string[];
  allowedTemplateIds?: string[];
  allowedBusinessHoursPolicyIds?: string[];
  allowedAuthenticationLevels?: string[];
  provider?: string | null;
  voiceRuntime?: string | null;
}

type Node = {
  id: string;
  data?: Record<string, unknown>;
};

type Edge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: Record<string, unknown>;
};

const SUPPORTED_NODE_KINDS = new Set([
  "START",
  "GREETING",
  "AI",
  "AI_CONVERSATION",
  "ACTION",
  "CONDITION",
  "DTMF_MENU",
  "HYBRID_MENU",
  "TRANSFER",
  "HUMAN_TRANSFER",
  "END_CALL",
  "KNOWLEDGE",
  "SEND_INFORMATION",
  "CALLBACK",
  "BUSINESS_HOURS",
  "AUTH_GATE",
]);

const AUTO_NODE_KINDS = new Set([
  "START",
  "GREETING",
  "CONDITION",
  "BUSINESS_HOURS",
  "AUTH_GATE",
  "SEND_INFORMATION",
]);

export function validateIVRFlowDefinition(
  input: ValidateIVRFlowInput
): IVRFlowValidationResult {
  const nodes = normalizeNodes(input.nodes);
  const edges = normalizeEdges(input.edges);
  const issues: IVRFlowValidationIssue[] = [];

  if (nodes.length === 0) {
    issues.push(error("EMPTY_FLOW", null, null, "The flow must contain at least one node."));
  }

  const startNodes = nodes.filter(node => kind(node) === "START");
  if (startNodes.length !== 1) {
    issues.push(
      error(
        "INVALID_START_COUNT",
        startNodes[0]?.id ?? null,
        "nodeKind",
        "The flow must contain exactly one START node."
      )
    );
  }

  const startRuntimeMode = normalizeRuntimeMode(startNodes[0]?.data?.runtimeMode);
  const startRuntimeDefault = normalizeSelectedRuntime(startNodes[0]?.data?.runtimeDefault);

  for (const node of nodes) {
    const nodeRuntimeMode = normalizeRuntimeMode(node.data?.runtimeMode);
    if (nodeRuntimeMode && kind(node) !== "START") {
      issues.push(error("INVALID_RUNTIME_SWITCH_LOCATION", node.id, "runtimeMode", "Voice runtime can only be configured on the START node and is resolved once at call entry."));
    }
  }

  if (startNodes[0] && startRuntimeMode === null && startNodes[0].data?.runtimeMode !== undefined) {
    issues.push(error("INVALID_RUNTIME_VALUE", startNodes[0].id, "runtimeMode", "Invalid runtime value. Use STANDARD, PREMIUM, or AUTO."));
  }

  if (startNodes[0] && startNodes[0].data?.runtimeDefault !== undefined && startRuntimeDefault === null) {
    issues.push(error("INVALID_RUNTIME_VALUE", startNodes[0].id, "runtimeDefault", "Invalid fallback runtime. Use STANDARD or PREMIUM."));
  }

  if (startRuntimeMode === "AUTO" && !startRuntimeDefault) {
    issues.push(error("AUTO_RUNTIME_DEFAULT_REQUIRED", startNodes[0]?.id ?? null, "runtimeDefault", "AUTO runtime requires a supported fallback or default runtime."));
  }

  const selectedRuntimeConfig = startRuntimeMode
    ? selectRuntime({
        tenant: {
          tenantId: input.tenantId ?? null,
          premiumVoiceEnabled: input.tenantPremiumVoiceEnabled ?? false,
        },
        provider: input.provider,
        flow: {
          id: null,
          versionId: null,
          runtimeMode: startRuntimeMode,
          runtimeDefault: startRuntimeDefault,
          nodes,
        },
        profile: {
          voiceRuntime: input.voiceRuntime === "GEMINI_LIVE" ? "GEMINI_LIVE" : input.voiceRuntime === "CASCADED" ? "CASCADED" : null,
          defaultRuntime: startRuntimeDefault ?? "STANDARD",
        },
        policy: {
          defaultRuntime: startRuntimeDefault ?? "STANDARD",
          useCase: deriveRuntimeUseCase(startNodes[0], nodes),
          complexityTier: deriveRuntimeComplexityTier(nodes),
          explicitPremiumRequired: startRuntimeMode === "PREMIUM",
        },
      })
    : null;

  if (startRuntimeMode === "PREMIUM" && !input.tenantPremiumVoiceEnabled) {
    issues.push(error("PREMIUM_VOICE_NOT_ENTITLED", startNodes[0]?.id ?? null, "runtimeMode", "Premium runtime requires the PREMIUM_VOICE entitlement."));
  }

  if (selectedRuntimeConfig && input.provider) {
    if (startRuntimeMode === "STANDARD" && selectedRuntimeConfig.selectedRuntime !== "STANDARD") {
      issues.push(error("UNSUPPORTED_PROVIDER_RUNTIME", startNodes[0]?.id ?? null, "runtimeMode", "The selected provider cannot safely support the Standard runtime for this flow."));
    }

    if (startRuntimeMode === "PREMIUM" && selectedRuntimeConfig.selectedRuntime !== "PREMIUM") {
      issues.push(error("UNSUPPORTED_PROVIDER_RUNTIME", startNodes[0]?.id ?? null, "runtimeMode", "The selected provider cannot safely support the Premium runtime for this flow."));
    }

    if (startRuntimeMode === "AUTO") {
      if (selectedRuntimeConfig.reasonCode.includes("UNSUPPORTED")) {
        issues.push(error("UNSUPPORTED_PROVIDER_RUNTIME", startNodes[0]?.id ?? null, "runtimeMode", selectedRuntimeConfig.reasonText));
      } else if (selectedRuntimeConfig.reasonCode.includes("FALLBACK")) {
        issues.push(warn("AUTO_RUNTIME_DEGRADED", startNodes[0]?.id ?? null, "runtimeMode", selectedRuntimeConfig.reasonText));
      }
    }
  }

  if (selectedRuntimeConfig?.reasonCode === "AUTO_INFORMATIONAL_USE_CASE") {
    issues.push(info(
      "AUTO_RUNTIME_INFORMATIONAL",
      startNodes[0]?.id ?? null,
      "runtimeMode",
      "Informational AUTO flows remain on the Standard runtime."
    ));
  }

  if (input.provider || input.voiceRuntime) {
    const startInputMode = stringValue(startNodes[0]?.data?.inputExperience) ?? stringValue(startNodes[0]?.data?.inputMode) ?? "VOICE_AND_DTMF";
    const realtimeInputCapability = resolveRealtimeInputCapability({
      provider: input.provider,
      runtime: input.voiceRuntime,
      inputMode: startInputMode,
    });
    if (realtimeInputCapability.support !== "SUPPORTED") {
      issues.push(warn(
        `REALTIME_INPUT_${realtimeInputCapability.support}`,
        startNodes[0]?.id ?? null,
        "inputMode",
        realtimeInputCapability.message
      ));
    }
  }

  if (stringValue(startNodes[0]?.data?.inputExperience) === "STAGED_HYBRID") {
    validateStagedHybridEntry(startNodes[0], nodes, edges, issues);
  }

  const nodeIds = new Set(nodes.map(node => node.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push(error("EDGE_SOURCE_MISSING", null, "source", `Edge source ${edge.source} does not exist.`));
    }
    if (!nodeIds.has(edge.target)) {
      issues.push(error("EDGE_TARGET_MISSING", null, "target", `Edge target ${edge.target} does not exist.`));
    }
  }

  for (const node of nodes) {
    const nodeKind = kind(node);

    if (!SUPPORTED_NODE_KINDS.has(nodeKind)) {
      issues.push(
        error(
          "UNSUPPORTED_NODE_TYPE",
          node.id,
          "nodeKind",
          `Unsupported IVR node type: ${nodeKind || "UNKNOWN"}.`
        )
      );
      continue;
    }

    if (nodeKind === "DTMF_MENU" || nodeKind === "HYBRID_MENU") {
      validateMenuNode(node, nodes, edges, issues);
    }

    if (nodeKind === "KNOWLEDGE") {
      validateKnowledgeNode(node, input, issues);
    }

    if (nodeKind === "ACTION") {
      validateActionNode(node, input, issues);
    }

    if (nodeKind === "SEND_INFORMATION") {
      validateSendInformationNode(node, input, issues);
    }

    if (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER") {
      validateTransferNode(node, edges, input, issues);
    }

    if (nodeKind === "CALLBACK") {
      validateCallbackNode(node, input, issues);
    }

    if (nodeKind === "BUSINESS_HOURS") {
      validateBusinessHoursNode(node, input, issues);
    }

    if (nodeKind === "CONDITION" && !stringValue(node.data?.conditionExpression)) {
      issues.push(error("INVALID_NODE_CONFIG", node.id, "conditionExpression", "Condition nodes require a condition expression."));
    }

    if (nodeKind === "AUTH_GATE") {
      validateAuthGateNode(node, input, issues);
    }
  }

  const reachable = computeReachableNodes(nodes, edges);
  for (const node of nodes) {
    if (kind(node) !== "START" && !reachable.has(node.id)) {
      issues.push(error("UNREACHABLE_NODE", node.id, null, `Node ${node.id} is unreachable from START.`));
    }
  }

  for (const node of nodes.filter(node => kind(node) === "END_CALL")) {
    if (edges.some(edge => edge.source === node.id)) {
      issues.push(error("TERMINAL_NODE_HAS_OUTGOING_EDGE", node.id, "edges", "END_CALL nodes must not have outgoing edges."));
    }
  }

  if (!nodes.some(node => kind(node) === "END_CALL")) {
    issues.push(warn("NO_TERMINAL_NODE", null, null, "The flow does not include an END_CALL node."));
  }

  issues.push(...analyzeLoopStructure(nodes, edges));
  issues.push(...analyzeAuthPaths(nodes, edges, reachable));

  return {
    valid: !issues.some(issue => issue.severity === "ERROR"),
    errors: issues.filter(issue => issue.severity === "ERROR"),
    warnings: issues.filter(issue => issue.severity === "WARNING"),
    issues,
  };
}

function validateStagedHybridEntry(start: Node | undefined, nodes: Node[], edges: Edge[], issues: IVRFlowValidationIssue[]): void {
  if (!start) return;
  const defaultAiNodeId = stringValue(start.data?.defaultAiNodeId);
  const defaultAiNode = nodes.find(node => node.id === defaultAiNodeId);
  if (!defaultAiNodeId) {
    issues.push(error("STAGED_DEFAULT_AI_REQUIRED", start.id, "defaultAiNodeId", "Staged Hybrid requires an explicit default AI node for no-selection fallback."));
  } else if (!defaultAiNode || !["AI", "AI_CONVERSATION"].includes(kind(defaultAiNode))) {
    issues.push(error("STAGED_DEFAULT_AI_INVALID", start.id, "defaultAiNodeId", "Staged Hybrid default AI node must reference an AI or AI_CONVERSATION node."));
  }

  const entryMenus = nodes.filter(node => ["HYBRID_MENU", "DTMF_MENU"].includes(kind(node)));
  if (entryMenus.length === 0) {
    issues.push(error("STAGED_ENTRY_MENU_REQUIRED", start.id, "inputExperience", "Staged Hybrid requires a keypad menu node."));
    return;
  }

  for (const menu of entryMenus) {
    const runtimeMenu = isRecord(menu.data?.runtimeMenu) ? menu.data.runtimeMenu : {};
    const maxAttempts = Number(runtimeMenu.maxAttempts ?? menu.data?.maxAttempts ?? 3);
    const timeout = Number(runtimeMenu.timeoutSeconds ?? 8);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) issues.push(error("STAGED_MAX_ATTEMPTS_INVALID", menu.id, "runtimeMenu.maxAttempts", "Staged Hybrid maximum attempts must be an integer from 1 to 5."));
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) issues.push(error("STAGED_TIMEOUT_INVALID", menu.id, "runtimeMenu.timeoutSeconds", "Staged Hybrid timeout must be an integer from 1 to 60 seconds."));

    const options = Array.isArray(menu.data?.options) ? menu.data.options : [];
    for (const rawOption of options) {
      const option = isRecord(rawOption) ? rawOption : {};
      const digit = stringValue(option.digit) ?? stringValue(option.dtmf);
      const target = stringValue(option.destinationNodeId);
      const action = stringValue(option.action)?.toUpperCase();
      const language = stringValue(option.language);
      const isAgentAction = action === "AGENT_REQUEST" || action === "HUMAN_AGENT";
      if (!digit || !/^[0-9*#]$/.test(digit)) issues.push(error("STAGED_DIGIT_INVALID", menu.id, "options.digit", "Staged Hybrid options must use exactly one DTMF digit."));
      if (!target && !isAgentAction) issues.push(error("STAGED_TARGET_REQUIRED", menu.id, "options.destinationNodeId", `Staged option ${digit ?? "?"} requires a target node.`));
      if (target && !nodes.some(node => node.id === target)) issues.push(error("STAGED_TARGET_INVALID", menu.id, "options.destinationNodeId", `Staged option ${digit ?? "?"} references missing node ${target}.`));
      if (isAgentAction && target && !nodes.some(node => node.id === target && ["HUMAN_TRANSFER", "TRANSFER"].includes(kind(node)))) issues.push(error("STAGED_AGENT_TARGET_INVALID", menu.id, "options", "An agent option target must be a valid human-transfer node."));
      if (language && !["English", "Hindi", "Hinglish", "AUTO"].includes(language)) issues.push(error("STAGED_LANGUAGE_INVALID", menu.id, "options.language", "Language must be English, Hindi, Hinglish, or AUTO."));
    }

    const fallback = stringValue(menu.data?.fallbackNodeId) ?? stringValue(menu.data?.escapeNodeId);
    if (fallback && !nodes.some(node => node.id === fallback)) issues.push(error("STAGED_FALLBACK_INVALID", menu.id, "fallbackNodeId", `Staged fallback references missing node ${fallback}.`));
    if (fallback && !edges.some(edge => edge.source === menu.id && edge.target === fallback)) issues.push(error("STAGED_FALLBACK_UNREACHABLE", menu.id, "fallbackNodeId", "Staged fallback requires an outgoing edge from the entry menu."));
  }
}

function validateMenuNode(node: Node, nodes: Node[], edges: Edge[], issues: IVRFlowValidationIssue[]): void {
  const options = Array.isArray(node.data?.options) ? node.data.options : [];

  if (options.length === 0) {
    issues.push(error("INVALID_NODE_CONFIG", node.id, "options", "Menu nodes require at least one option."));
    return;
  }

  const digits = new Set<string>();
  for (const option of options) {
    const optionRecord = isRecord(option) ? option : null;
    // Read compatibility for historical graphs. Generation and persistence
    // normalize this alias away before a new graph is saved.
    const digit = stringValue(optionRecord?.digit) ?? stringValue(optionRecord?.dtmf);
    const label = stringValue(optionRecord?.label);
    const destinationNodeId = stringValue(optionRecord?.destinationNodeId);
    const optionAction = stringValue(optionRecord?.action)?.toUpperCase();
    const isDirectAgentRequest = optionAction === "AGENT_REQUEST" || optionAction === "HUMAN_AGENT";

    if (!digit || !label) {
      issues.push(error("INVALID_NODE_CONFIG", node.id, "options", "Every menu option requires a digit and label."));
      continue;
    }

    if (digits.has(digit)) {
      issues.push(error("DUPLICATE_MENU_DIGIT", node.id, "options", `Digit ${digit} is duplicated in the same menu.`));
    }
    digits.add(digit);

    const dtmfEdges = edges.filter(edge =>
      edge.source === node.id &&
      normalizeToken(edge.data?.trigger) === "DTMF"
    );

    /*
     * A menu route is identified by its digit, never by its destination.
     * Several choices may intentionally lead to one knowledge node.
     */
    const digitEdges = dtmfEdges.filter(edge =>
      stringValue(edge.sourceHandle) === digit ||
      stringValue(edge.data?.value) === digit
    );

    const canonicalEdges = digitEdges.filter(edge =>
      stringValue(edge.sourceHandle) === digit &&
      stringValue(edge.data?.value) === digit &&
      edge.target === destinationNodeId
    );

    // Older persisted flows did not store the source handle.  Keep that
    // unambiguous shape valid, while all routes produced or normalized today
    // use the canonical source-handle/value pair above.
    const legacyEdges = digitEdges.filter(edge =>
      !stringValue(edge.sourceHandle) &&
      stringValue(edge.data?.value) === digit &&
      edge.target === destinationNodeId
    );

    const conflictingEdges = digitEdges.filter(edge =>
      (stringValue(edge.sourceHandle) && stringValue(edge.sourceHandle) !== digit) ||
      stringValue(edge.data?.value) !== digit ||
      edge.target !== destinationNodeId
    );

    if (!destinationNodeId) {
      if (!isDirectAgentRequest) issues.push(error("MISSING_MENU_DESTINATION", node.id, "options", `Menu option ${digit} is missing a destination.`));
    } else if (!nodes.some(candidate => candidate.id === destinationNodeId)) {
      issues.push(error("MENU_DESTINATION_NODE_MISSING", node.id, "options.destinationNodeId", `Menu option ${digit} references missing node ${destinationNodeId}.`));
    } else if (canonicalEdges.length + legacyEdges.length !== 1) {
      issues.push(error("MENU_DTMF_ROUTE_INVALID", node.id, "options.destinationNodeId", `Menu option ${digit} requires exactly one DTMF edge to ${destinationNodeId} with value ${digit}.`));
    }

    for (const edge of conflictingEdges) {
      issues.push(error("MENU_DTMF_METADATA_CONFLICT", node.id, "edges", `Menu option ${digit} conflicts with DTMF edge metadata for ${edge.target}.`));
    }
  }

  const dtmfEdges = edges.filter(edge =>
    edge.source === node.id &&
    normalizeToken(edge.data?.trigger) === "DTMF"
  );

  for (const edge of dtmfEdges) {
    const handle = stringValue(edge.sourceHandle);
    const value = stringValue(edge.data?.value);

    if (
      !value ||
      (handle && handle !== value) ||
      (handle && !digits.has(handle)) ||
      !digits.has(value)
    ) {
      issues.push(error(
        "MENU_DTMF_METADATA_CONFLICT",
        node.id,
        "edges",
        `DTMF edge for ${edge.target} does not map to one canonical menu digit.`
      ));
    }
  }

  const hasFallback =
    stringValue(node.data?.fallbackNodeId) ||
    stringValue(node.data?.escapeNodeId) ||
    edges.some(edge => edge.source === node.id && ["DEFAULT", "FAILURE", "FALLBACK"].includes(normalizeToken(edge.data?.trigger)));

  if (!hasFallback) {
    issues.push(warn("MISSING_FALLBACK", node.id, null, "Menu nodes should define a fallback path for unmatched input."));
  }
}

function validateKnowledgeNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const documentIds = toStringArray(
    node.data?.knowledgeDocumentIds ??
      node.data?.knowledgeIds ??
      node.data?.knowledge
  );

  if (documentIds.length === 0) {
    issues.push(warn("KNOWLEDGE_SCOPE_EMPTY", node.id, "knowledgeDocumentIds", "Knowledge nodes should reference approved knowledge documents."));
  }

  if (input.allowedKnowledgeDocumentIds !== undefined) {
    const allowed = new Set(input.allowedKnowledgeDocumentIds.map(id => id.trim()).filter(Boolean));
    for (const id of documentIds) {
      if (!allowed.has(id)) {
        issues.push(error("KNOWLEDGE_CROSS_TENANT", node.id, "knowledgeDocumentIds", `Knowledge document ${id} is not allowed in this flow context.`));
      }
    }
  }

}

function validateActionNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const actionCode = stringValue(node.data?.actionCode);

  if (!actionCode) {
    issues.push(error("INVALID_NODE_CONFIG", node.id, "actionCode", "Action nodes require an action code."));
    return;
  }

  if (input.allowedActionCodes !== undefined) {
    const allowed = new Set(input.allowedActionCodes.map(code => code.trim().toUpperCase()).filter(Boolean));
    if (!allowed.has(actionCode.toUpperCase())) {
      issues.push(error("ACTION_NOT_ALLOWED", node.id, "actionCode", `Action code ${actionCode} is not permitted in this tenant context.`));
    }
  }
}

function validateTransferNode(
  node: Node,
  edges: Edge[],
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const destinationId = stringValue(node.data?.transferDestinationId);
  const destinationRef = stringValue(node.data?.destinationRef);
  const destinationType = stringValue(node.data?.destinationType);

  if (!destinationId) {
    issues.push(error("TRANSFER_DESTINATION_REQUIRED", node.id, "transferDestinationId", "Human transfer nodes require transferDestinationId."));
  }

  if (stringValue(node.data?.transferDestination) || stringValue(node.data?.destinationId) || stringValue(node.data?.humanTransferDestinationId)) {
    issues.push(error("TRANSFER_LEGACY_FIELD", node.id, "transferDestinationId", "Use transferDestinationId only; legacy transfer destination aliases are not persisted."));
  }

  if (destinationId && input.allowedTransferDestinationIds !== undefined) {
    const allowed = new Set(input.allowedTransferDestinationIds.map(id => id.trim()).filter(Boolean));
    if (!allowed.has(destinationId)) {
      issues.push(error("TRANSFER_CROSS_TENANT", node.id, "transferDestinationId", `Transfer destination ${destinationId} is not allowed in this tenant context.`));
    }
  }

  if (destinationRef && destinationId && destinationRef !== destinationId) {
    issues.push(error("TRANSFER_DESTINATION_MISMATCH", node.id, "destinationRef", "destinationRef must match the tenant-owned transfer destination."));
  }
  if (destinationType && !["PHONE", "SIP", "USER"].includes(destinationType)) {
    issues.push(error("TRANSFER_DESTINATION_TYPE_INVALID", node.id, "destinationType", "Transfer destination type must be PHONE, SIP, or USER."));
  }
  const policyId = stringValue(node.data?.businessHoursPolicy) ?? stringValue(node.data?.businessHoursPolicyId);
  if (policyId && input.allowedBusinessHoursPolicyIds !== undefined && !new Set(input.allowedBusinessHoursPolicyIds).has(policyId)) {
    issues.push(error("TRANSFER_BUSINESS_HOURS_POLICY_NOT_ALLOWED", node.id, "businessHoursPolicy", `Business-hours policy ${policyId} is not permitted in this tenant context.`));
  }
  validateFallbackNode(node, edges, nodesFromEdges(edges), issues);

  for (const trigger of ["HUMAN_TRANSFER", "ACTION_FAILURE"]) {
    if (!edges.some(edge => edge.source === node.id && normalizeToken(edge.data?.trigger) === trigger)) {
      issues.push(error("TRANSFER_OUTCOME_EDGE_MISSING", node.id, "edges", `Human transfer nodes require a ${trigger} outcome edge.`));
    }
  }
}

function validateCallbackNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const callbackTarget = stringValue(node.data?.callbackConfigId) ?? stringValue(node.data?.callbackDestinationId);
  if (node.data?.enabled === false && callbackTarget) {
    issues.push(error("CALLBACK_DISABLED_WITH_BRANCH", node.id, "enabled", "A disabled callback node cannot retain a callback configuration."));
  }
  const timezonePolicy = stringValue(node.data?.timezonePolicy);
  if (timezonePolicy && !["TENANT", "CALLER"].includes(timezonePolicy)) {
    issues.push(error("CALLBACK_TIMEZONE_POLICY_INVALID", node.id, "timezonePolicy", "Callback timezone policy must be TENANT or CALLER."));
  }
  if (callbackTarget && input.allowedCallbackDestinationIds !== undefined) {
    const allowed = new Set(input.allowedCallbackDestinationIds.map(id => id.trim()).filter(Boolean));
    if (!allowed.has(callbackTarget)) {
      issues.push(error("CALLBACK_CROSS_TENANT", node.id, "callbackConfigId", `Callback target ${callbackTarget} is not allowed in this tenant context.`));
    }
  }
}

function validateFallbackNode(node: Node, edges: Edge[], nodes: Set<string>, issues: IVRFlowValidationIssue[]): void {
  const fallbackNodeId = stringValue(node.data?.fallbackNodeId);
  if (!fallbackNodeId) return;
  if (!nodes.has(fallbackNodeId)) {
    issues.push(error("FALLBACK_NODE_INVALID", node.id, "fallbackNodeId", `Fallback node ${fallbackNodeId} does not exist.`));
  } else if (!edges.some(edge => edge.source === node.id && edge.target === fallbackNodeId)) {
    issues.push(error("FALLBACK_EDGE_MISSING", node.id, "fallbackNodeId", "Fallback node requires an outgoing edge from this node."));
  }
}

function nodesFromEdges(edges: Edge[]): Set<string> {
  return new Set(edges.flatMap(edge => [edge.source, edge.target]));
}

function validateSendInformationNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const templateId = stringValue(node.data?.sendInformationTemplateId);

  if (!templateId) {
    issues.push(error("INVALID_NODE_CONFIG", node.id, "sendInformationTemplateId", "Send-information nodes require an approved message template."));
    return;
  }

  if (input.allowedTemplateIds !== undefined) {
    const allowed = new Set(input.allowedTemplateIds.map(id => id.trim()).filter(Boolean));
    if (!allowed.has(templateId)) {
      issues.push(error("TEMPLATE_NOT_ALLOWED", node.id, "sendInformationTemplateId", `Message template ${templateId} is not permitted in this tenant context.`));
    }
  }
}

function validateBusinessHoursNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const policyId = stringValue(node.data?.businessHoursPolicyId);

  if (!policyId) {
    issues.push(error("INVALID_NODE_CONFIG", node.id, "businessHoursPolicyId", "Business-hours nodes require an approved policy."));
    return;
  }

  if (input.allowedBusinessHoursPolicyIds !== undefined) {
    const allowed = new Set(input.allowedBusinessHoursPolicyIds.map(id => id.trim()).filter(Boolean));
    if (!allowed.has(policyId)) {
      issues.push(error("BUSINESS_HOURS_POLICY_NOT_ALLOWED", node.id, "businessHoursPolicyId", `Business-hours policy ${policyId} is not permitted in this tenant context.`));
    }
  }
}

function validateAuthGateNode(
  node: Node,
  input: ValidateIVRFlowInput,
  issues: IVRFlowValidationIssue[]
): void {
  const authLevel =
    stringValue(node.data?.requiredAuthLevel) ??
    stringValue(node.data?.minimumAuthLevel) ??
    stringValue(node.data?.authLevel) ??
    stringValue(node.data?.authenticationLevel);

  if (!authLevel) {
    issues.push(error("INVALID_NODE_CONFIG", node.id, "requiredAuthLevel", "Auth gate nodes require a minimum auth level."));
    return;
  }

  if (input.allowedAuthenticationLevels !== undefined) {
    const allowed = new Set(input.allowedAuthenticationLevels.map(level => level.trim().toUpperCase()).filter(Boolean));
    if (!allowed.has(authLevel.toUpperCase())) {
      issues.push(error("AUTH_LEVEL_NOT_ALLOWED", node.id, "requiredAuthLevel", `Authentication level ${authLevel} is not permitted in this tenant context.`));
    }
  }
}

function computeReachableNodes(nodes: Node[], edges: Edge[]): Set<string> {
  const reachable = new Set<string>();
  const start = nodes.find(node => kind(node) === "START");
  if (!start) {
    return reachable;
  }

  const stack = [start.id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const edge of edges.filter(edge => edge.source === current)) {
      stack.push(edge.target);
    }
  }

  return reachable;
}

function analyzeLoopStructure(nodes: Node[], edges: Edge[]): IVRFlowValidationIssue[] {
  const issues: IVRFlowValidationIssue[] = [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const adjacency = buildAdjacency(edges);
  const components = stronglyConnectedComponents(nodes, adjacency);

  for (const component of components) {
    const componentNodes = component.map(nodeId => nodeById.get(nodeId)).filter((node): node is Node => Boolean(node));
    const hasCycle =
      component.length > 1 ||
      component.some(nodeId => adjacency.get(nodeId)?.some(target => target === nodeId));

    if (!hasCycle) {
      continue;
    }

    const exitEdges = edges.filter(edge => component.includes(edge.source) && !component.includes(edge.target));
    const boundedRetry = componentNodes.some(node => hasBoundedRetry(node));
    const autoOnly = componentNodes.length > 0 && componentNodes.every(node => AUTO_NODE_KINDS.has(kind(node)));

    if (exitEdges.length === 0 && !boundedRetry) {
      issues.push(error(
        "UNBOUNDED_LOOP",
        componentNodes[0]?.id ?? null,
        null,
        "The flow contains an unconditional cycle without an exit or retry limit."
      ));
      continue;
    }

    if (autoOnly && !boundedRetry && exitEdges.length > 0) {
      issues.push(warn(
        "BOUNDED_LOOP_REQUIRES_EXIT_CHECK",
        componentNodes[0]?.id ?? null,
        null,
        "This automatic loop has an exit path, but it still deserves a retry limit or explicit break condition."
      ));
    }
  }

  return issues;
}

function analyzeAuthPaths(nodes: Node[], edges: Edge[], reachable: Set<string>): IVRFlowValidationIssue[] {
  const issues: IVRFlowValidationIssue[] = [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const adjacency = buildAdjacency(edges);
  const start = nodes.find(node => kind(node) === "START");
  if (!start) {
    return issues;
  }

  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      continue;
    }
    if (!isSensitiveNode(node)) {
      continue;
    }
    if (isReachableWithoutAuth(start.id, node.id, nodeById, adjacency)) {
      issues.push(error(
        "AUTH_PATH_REQUIRED",
        node.id,
        null,
        "Sensitive actions must only be reachable through an authentication-gated path."
      ));
    }
  }

  return issues;
}

function isSensitiveNode(node: Node): boolean {
  const nodeKind = kind(node);
  if (nodeKind === "TRANSFER" || nodeKind === "HUMAN_TRANSFER" || nodeKind === "CALLBACK") {
    return true;
  }
  if (nodeKind !== "ACTION") {
    return false;
  }

  const risk = inferActionRisk(node);
  return risk !== "READ_ONLY";
}

function inferActionRisk(node: Node): "READ_ONLY" | "MUTATING" | "SENSITIVE" {
  const explicit = stringValue(node.data?.toolRisk) ?? stringValue(node.data?.risk) ?? stringValue(node.data?.businessToolRisk);
  if (explicit) {
    const token = explicit.toUpperCase();
    if (token === "READ_ONLY" || token === "MUTATING" || token === "SENSITIVE") {
      return token;
    }
  }
  const text = [
    stringValue(node.data?.actionCode),
    stringValue(node.data?.label),
    stringValue(node.data?.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (/(SEARCH|LOOKUP|LIST|FETCH|READ|VIEW|GET)/.test(text)) return "READ_ONLY";
  if (/(TRANSFER|CALLBACK|BOOK|CREATE|SEND|PAY|SMS|WHATSAPP|EMAIL|KYC|CONSENT|END CALL|END_CALL)/.test(text)) return "SENSITIVE";
  return "MUTATING";
}

function isReachableWithoutAuth(
  startId: string,
  targetId: string,
  nodeById: Map<string, Node>,
  adjacency: Map<string, string[]>
): boolean {
  const visited = new Set<string>();

  function visit(nodeId: string, authPassed: boolean): boolean {
    const stateKey = `${nodeId}:${authPassed ? "1" : "0"}`;
    if (visited.has(stateKey)) {
      return false;
    }
    visited.add(stateKey);

    const node = nodeById.get(nodeId);
    const nextAuthPassed = authPassed || kind(node ?? null) === "AUTH_GATE";

    if (nodeId === targetId) {
      return !authPassed && kind(node ?? null) !== "AUTH_GATE";
    }

    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      if (visit(nextNodeId, nextAuthPassed)) {
        return true;
      }
    }

    return false;
  }

  return visit(startId, false);
}

function buildAdjacency(edges: Edge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  return adjacency;
}

function stronglyConnectedComponents(nodes: Node[], adjacency: Map<string, string[]>): string[][] {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;

  function visit(nodeId: string): void {
    indexByNode.set(nodeId, index);
    lowLinkByNode.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    for (const nextId of adjacency.get(nodeId) ?? []) {
      if (!indexByNode.has(nextId)) {
        visit(nextId);
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId) ?? 0, lowLinkByNode.get(nextId) ?? 0));
      } else if (onStack.has(nextId)) {
        lowLinkByNode.set(nodeId, Math.min(lowLinkByNode.get(nodeId) ?? 0, indexByNode.get(nextId) ?? 0));
      }
    }

    if (lowLinkByNode.get(nodeId) === indexByNode.get(nodeId)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (!current) {
          break;
        }
        onStack.delete(current);
        component.push(current);
      } while (current !== nodeId);
      components.push(component);
    }
  }

  for (const node of nodes) {
    if (!indexByNode.has(node.id)) {
      visit(node.id);
    }
  }

  return components;
}

function hasBoundedRetry(node: Node): boolean {
  for (const key of ["maxAttempts", "retryLimit", "attemptLimit", "maxRetries"]) {
    const value = node.data?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 20) {
      return true;
    }
  }
  return false;
}

function normalizeRuntimeMode(value: unknown): IVRRuntimeMode | null {
  const token = stringValue(value)?.toUpperCase();
  if (token === "STANDARD" || token === "PREMIUM" || token === "AUTO") return token;
  return null;
}

function normalizeSelectedRuntime(value: unknown): "STANDARD" | "PREMIUM" | null {
  const token = stringValue(value)?.toUpperCase();
  if (token === "STANDARD" || token === "PREMIUM") return token;
  return null;
}

function deriveRuntimeComplexityTier(nodes: Node[]): "LOW" | "MEDIUM" | "HIGH" {
  const nodeKinds = new Set(nodes.map(node => kind(node)));
  if (nodes.length >= 8 || nodeKinds.has("AI") || nodeKinds.has("AI_CONVERSATION") || nodeKinds.has("KNOWLEDGE") || nodeKinds.has("ACTION")) return "HIGH";
  if (nodes.length >= 4 || nodeKinds.has("TRANSFER") || nodeKinds.has("HUMAN_TRANSFER") || nodeKinds.has("AUTH_GATE")) return "MEDIUM";
  return "LOW";
}

function deriveRuntimeUseCase(startNode: Node | undefined, nodes: Node[]): "FAQ" | "INFORMATION" | "REMINDER" | "SURVEY" | "BASIC_QUALIFICATION" | "ESCALATION" | "UNKNOWN" {
  const text = [stringValue(startNode?.data?.label), stringValue(startNode?.data?.description), stringValue(startNode?.data?.prompt)]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (/(faq|information|help|support)/.test(text)) return "INFORMATION";
  if (/(reminder|callback|appointment)/.test(text)) return "REMINDER";
  if (/(survey|feedback)/.test(text)) return "SURVEY";
  if (/(qualification|qualify|screen)/.test(text)) return "BASIC_QUALIFICATION";

  const nodeKinds = new Set(nodes.map(node => kind(node)));
  if (nodeKinds.has("CALLBACK")) return "REMINDER";
  if (nodeKinds.has("KNOWLEDGE")) return "FAQ";
  if (nodeKinds.has("TRANSFER") || nodeKinds.has("HUMAN_TRANSFER")) return "ESCALATION";
  if (nodeKinds.has("CONDITION") || nodeKinds.has("AUTH_GATE")) return "BASIC_QUALIFICATION";
  return "UNKNOWN";
}

function normalizeNodes(value: unknown): Node[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map(node => {
      const data = isRecord(node.data) ? sanitizeRecord(node.data) : undefined;
      if (data && ["HYBRID_MENU", "DTMF_MENU"].includes(normalizeToken(data.nodeKind))) {
        const runtimeMenu = isRecord(data.runtimeMenu) ? data.runtimeMenu : null;
        const legacyOptions = Array.isArray(data.menuOptions)
          ? data.menuOptions
          : Array.isArray(runtimeMenu?.options)
            ? runtimeMenu.options
            : null;
        if (!Array.isArray(data.options) && legacyOptions) {
          data.options = legacyOptions;
        }
      }
      return {
        id: stringValue(node.id) ?? "",
        data,
      };
    })
    .filter(node => Boolean(node.id));
}

function normalizeEdges(value: unknown): Edge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map(edge => ({
      source: stringValue(edge.source) ?? "",
      target: stringValue(edge.target) ?? "",
      sourceHandle: stringValue(edge.sourceHandle),
      data: isRecord(edge.data) ? sanitizeRecord(edge.data) : undefined,
    }))
    .filter(edge => Boolean(edge.source) && Boolean(edge.target));
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      record[key] = raw;
      continue;
    }
    if (Array.isArray(raw)) {
      record[key] = raw.map(item =>
        isRecord(item)
          ? sanitizeRecord(item)
          : item
      );
      continue;
    }
    if (isRecord(raw)) {
      record[key] = sanitizeRecord(raw);
    }
  }
  return record;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (isRecord(item) && typeof item.id === "string") {
        return item.id.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function kind(node: Node | null | undefined): string {
  return stringValue(node?.data?.nodeKind)?.toUpperCase() ?? "";
}

function normalizeToken(value: unknown): string {
  return stringValue(value)?.toUpperCase() ?? "";
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(
  code: string,
  nodeId: string | null,
  field: string | null,
  message: string
): IVRFlowValidationIssue {
  return issue(code, nodeId, field, message, "ERROR");
}

function warn(
  code: string,
  nodeId: string | null,
  field: string | null,
  message: string
): IVRFlowValidationIssue {
  return issue(code, nodeId, field, message, "WARNING");
}

function info(
  code: string,
  nodeId: string | null,
  field: string | null,
  message: string
): IVRFlowValidationIssue {
  return issue(code, nodeId, field, message, "INFO");
}

function issue(
  code: string,
  nodeId: string | null,
  field: string | null,
  message: string,
  severity: IVRFlowValidationSeverity
): IVRFlowValidationIssue {
  return {
    code,
    nodeId,
    edgeId: null,
    field,
    category: inferCategory(code),
    title: inferTitle(code, message),
    description: message,
    suggestedFix: inferSuggestedFix(code, message),
    message,
    severity,
  };
}

function inferCategory(code: string): string {
  if (code.includes("RUNTIME")) return "runtime";
  if (code.includes("TRANSFER")) return "transfer";
  if (code.includes("CALLBACK")) return "callback";
  if (code.includes("KNOWLEDGE")) return "knowledge";
  if (code.includes("ACTION")) return "tool";
  if (code.includes("AUTH")) return "auth";
  if (code.includes("BUSINESS_HOURS")) return "business_hours";
  if (code.includes("LANGUAGE")) return "language";
  if (code.includes("MENU") || code.includes("DTMF")) return "input";
  if (code.includes("EDGE") || code.includes("START") || code.includes("UNREACHABLE") || code.includes("TERMINAL") || code.includes("LOOP") || code.includes("NODE") || code.includes("FLOW")) return "structure";
  return "general";
}

function inferTitle(code: string, message: string): string {
  const cleaned = code
    .toLowerCase()
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  if (message.trim().endsWith(".")) return message.trim().slice(0, -1);
  return cleaned || "Validation issue";
}

function inferSuggestedFix(code: string, message: string): string | null {
  if (code === "INVALID_START_COUNT") return "Keep exactly one START node in the flow.";
  if (code === "UNREACHABLE_NODE") return "Connect this node to the graph from START or remove it.";
  if (code === "EDGE_TARGET_MISSING") return "Reconnect the edge to an existing node.";
  if (code === "EDGE_SOURCE_MISSING") return "Reconnect the edge from an existing node.";
  if (code === "MISSING_FALLBACK") return "Add a fallback route for unmatched input.";
  if (code === "FALLBACK_NODE_INVALID") return "Choose an existing node as the fallback target.";
  if (code === "AUTO_RUNTIME_DEFAULT_REQUIRED") return "Set runtimeDefault to STANDARD or PREMIUM.";
  if (code === "INVALID_RUNTIME_VALUE") return "Use STANDARD, PREMIUM, or AUTO for runtime settings.";
  if (code === "INVALID_RUNTIME_SWITCH_LOCATION") return "Move runtime configuration back to the START node.";
  if (code === "PREMIUM_VOICE_NOT_ENTITLED") return "Enable the PREMIUM_VOICE entitlement or choose STANDARD runtime.";
  if (code === "MENU_DTMF_ROUTE_INVALID") return "Ensure each DTMF option has one matching edge.";
  if (code === "TRANSFER_DESTINATION_REQUIRED") return "Select a valid transfer destination.";
  if (code === "CALLBACK_CROSS_TENANT") return "Choose a callback target within the current tenant.";
  if (code === "AUTH_LEVEL_NOT_ALLOWED") return "Choose an authentication level supported by this tenant.";
  if (code === "UNBOUNDED_LOOP") return "Add a terminating edge, retry limit, or escape path.";
  if (code === "AUTH_PATH_REQUIRED") return "Place an AUTH_GATE before this sensitive action or transfer.";
  return message.includes("requires") ? message : null;
}
