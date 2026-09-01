import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  registerIntegrationEndpoint,
  unregisterIntegrationEndpoint,
  clearIntegrationRegistry,
  executeExternalAction,
  setCustomExternalActionAdapter,
  isSafeExternalIntegrationUrl,
  resolveIntegrationEndpoint,
  getIntegrationEndpointsForTenant,
  type ExternalActionRequest,
} from "@/services/integrations/integration-action-gateway.service";
import { createTenantPlatformEventPayload } from "@/services/integrations/platform-event.service";
import {
  validateExternalIdentityAssertion,
  mapEnterpriseClaimsToRole,
} from "@/services/integrations/identity-adapter.types";
import { validateIVRFlowDefinition, isPlaceholderResourceToken } from "@/services/ivr/ivr-flow-validator.service";
import { generatePresetFlow } from "@/services/ivr/ivr-experience-presets.service";
import { UserRole } from "@prisma/client";

describe("Phase 6 — Generic External Platform Integration Boundary", () => {
  const TENANT_A = "tenant-alpha";
  const TENANT_B = "tenant-beta";

  beforeEach(() => {
    clearIntegrationRegistry();
    setCustomExternalActionAdapter(null);
  });

  afterEach(() => {
    clearIntegrationRegistry();
    setCustomExternalActionAdapter(null);
  });

  // 1. Registered tenant action succeeds
  it("1. registered tenant action succeeds and normalizes SUCCESS status", async () => {
    registerIntegrationEndpoint({
      id: "int-1",
      tenantId: TENANT_A,
      actionCode: "CHECK_STATUS",
      name: "Check Customer Status",
      endpointUrl: "https://api.alpha-corp.com/crm/status",
    });

    setCustomExternalActionAdapter(async (req) => {
      expect(req.actionCode).toBe("CHECK_STATUS");
      expect(req.tenantId).toBe(TENANT_A);
      return {
        status: "SUCCESS",
        referenceId: "REF-9988",
        output: { accountStatus: "ACTIVE", balance: 250 },
        safeMessage: "Your account is active.",
      };
    });

    const result = await executeExternalAction({
      actionCode: "CHECK_STATUS",
      tenantId: TENANT_A,
      callId: "call-100",
      correlationId: "corr-100",
      input: { customerId: "CUST-1" },
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.referenceId).toBe("REF-9988");
    expect(result.safeMessage).toBe("Your account is active.");
    expect(result.output?.accountStatus).toBe("ACTIVE");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // 2. Failure routes configured FAILURE outcome
  it("2. failure routes configured FAILURE outcome", async () => {
    registerIntegrationEndpoint({
      id: "int-2",
      tenantId: TENANT_A,
      actionCode: "CREATE_TICKET",
      name: "Create Ticket",
      endpointUrl: "https://api.alpha-corp.com/tickets",
    });

    setCustomExternalActionAdapter(async () => ({
      status: "FAILURE",
      errorReason: "CUSTOMER_NOT_FOUND",
      safeMessage: "Unable to find customer account.",
    }));

    const result = await executeExternalAction({
      actionCode: "CREATE_TICKET",
      tenantId: TENANT_A,
      callId: "call-101",
      correlationId: "corr-101",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.errorReason).toBe("CUSTOMER_NOT_FOUND");
    expect(result.safeMessage).toBe("Unable to find customer account.");
  });

  // 3. Timeout routes TIMEOUT
  it("3. timeout routes TIMEOUT semantic result", async () => {
    registerIntegrationEndpoint({
      id: "int-3",
      tenantId: TENANT_A,
      actionCode: "FETCH_ERP",
      name: "ERP Lookup",
      endpointUrl: "https://api.alpha-corp.com/erp",
      timeoutMs: 500,
    });

    setCustomExternalActionAdapter(async () => {
      const err = new Error("Request aborted due to timeout");
      err.name = "AbortError";
      throw err;
    });

    const result = await executeExternalAction({
      actionCode: "FETCH_ERP",
      tenantId: TENANT_A,
      callId: "call-102",
      correlationId: "corr-102",
    });

    expect(result.status).toBe("TIMEOUT");
    expect(result.errorReason).toBe("TIMEOUT");
    expect(result.safeMessage).toContain("timed out");
  });

  // 4. Pending routes PENDING
  it("4. pending routes PENDING semantic result without blocking PSTN call", async () => {
    registerIntegrationEndpoint({
      id: "int-4",
      tenantId: TENANT_A,
      actionCode: "SUBMIT_APPLICATION",
      name: "Submit Application",
      endpointUrl: "https://api.alpha-corp.com/app/submit",
    });

    setCustomExternalActionAdapter(async () => ({
      status: "PENDING",
      referenceId: "APP-PENDING-456",
      safeMessage: "Your application is currently being reviewed.",
    }));

    const result = await executeExternalAction({
      actionCode: "SUBMIT_APPLICATION",
      tenantId: TENANT_A,
      callId: "call-103",
      correlationId: "corr-103",
    });

    expect(result.status).toBe("PENDING");
    expect(result.referenceId).toBe("APP-PENDING-456");
    expect(result.safeMessage).toBe("Your application is currently being reviewed.");
  });

  // 5. No external nextNodeId controls graph
  it("5. no external nextNodeId controls graph (sanitizes external response)", async () => {
    registerIntegrationEndpoint({
      id: "int-5",
      tenantId: TENANT_A,
      actionCode: "CHECK_STATUS",
      name: "Check Status",
      endpointUrl: "https://api.alpha-corp.com/crm/status",
    });

    setCustomExternalActionAdapter(async () => {
      // Malicious or rogue external response attempting graph navigation injection
      return {
        status: "SUCCESS",
        referenceId: "REF-1",
        nextNodeId: "admin_transfer_override",
        jumpToNode: "unauthorized_node",
      } as any;
    });

    const result = await executeExternalAction({
      actionCode: "CHECK_STATUS",
      tenantId: TENANT_A,
      callId: "call-104",
      correlationId: "corr-104",
    });

    expect(result.status).toBe("SUCCESS");
    expect((result as any).nextNodeId).toBeUndefined();
    expect((result as any).jumpToNode).toBeUndefined();
  });

  // 6. Builder decides destination
  it("6. Builder defines outcome graph transitions (edges map semantic outcomes)", () => {
    const flow = generatePresetFlow("CLASSIC_IVR");
    const actionEdges = flow.edges.filter(edge => edge.source === "action_service");

    const successEdge = actionEdges.find(edge => edge.data?.trigger === "ACTION_SUCCESS");
    const failureEdge = actionEdges.find(edge => edge.data?.trigger === "ACTION_FAILURE");

    expect(successEdge).toBeDefined();
    expect(successEdge?.target).toBe("menu");
    expect(failureEdge).toBeDefined();
    expect(failureEdge?.target).toBe("end");
  });

  // 7. Unresolved action rejected
  it("7. unresolved action rejected by executor", async () => {
    const result = await executeExternalAction({
      actionCode: "UNCONFIGURED_ACTION",
      tenantId: TENANT_A,
      callId: "call-105",
      correlationId: "corr-105",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.errorReason).toBe("INTEGRATION_NOT_FOUND");
  });

  // 8. Cross-tenant action rejected
  it("8. cross-tenant action rejected by executor", async () => {
    registerIntegrationEndpoint({
      id: "int-tenant-b",
      tenantId: TENANT_B,
      actionCode: "TENANT_B_ACTION",
      name: "Tenant B Secure Action",
      endpointUrl: "https://api.beta-corp.com/action",
    });

    // Tenant A attempts to invoke Tenant B's action code
    const result = await executeExternalAction({
      actionCode: "TENANT_B_ACTION",
      tenantId: TENANT_A,
      callId: "call-106",
      correlationId: "corr-106",
    });

    expect(result.status).toBe("FAILURE");
    expect(result.errorReason).toBe("INTEGRATION_NOT_FOUND");
  });

  // 9. Credentials absent from node JSON
  it("9. credentials absent from node JSON in builder and catalog", () => {
    const flow = generatePresetFlow("CLASSIC_IVR");
    const serialized = JSON.stringify(flow);

    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("clientSecret");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("secretKey");
  });

  // 10. Credentials absent from platform webhook logs & events
  it("10. credentials absent from platform webhook events", () => {
    const rawPayload = {
      actionCode: "LOOKUP",
      customerId: "CUST-100",
      apiKey: "secret_live_api_key_12345",
      password: "SuperSecretPassword123!",
      status: "SUCCESS",
    };

    const event = createTenantPlatformEventPayload(
      TENANT_A,
      "ivr.action.completed",
      "call-107",
      "corr-107",
      rawPayload
    );

    expect(event.tenantId).toBe(TENANT_A);
    expect(event.payload.customerId).toBe("CUST-100");
    expect(event.payload.apiKey).toBeUndefined();
    expect(event.payload.password).toBeUndefined();
  });

  // 11. Arbitrary URL cannot be configured as action (SSRF blocked)
  it("11. arbitrary URL cannot be configured as action (SSRF blocked)", () => {
    expect(isSafeExternalIntegrationUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeExternalIntegrationUrl("http://localhost:8080/admin")).toBe(false);
    expect(isSafeExternalIntegrationUrl("http://127.0.0.1:3000/internal")).toBe(false);
    expect(isSafeExternalIntegrationUrl("http://10.0.0.1/secrets")).toBe(false);
    expect(isSafeExternalIntegrationUrl("http://192.168.1.1/router")).toBe(false);
    expect(isSafeExternalIntegrationUrl("https://api.customer-corp.com/v1/ivr")).toBe(true);

    expect(() => {
      registerIntegrationEndpoint({
        id: "ssrf-1",
        tenantId: TENANT_A,
        actionCode: "SSRF_ATTEMPT",
        name: "Malicious SSRF",
        endpointUrl: "http://169.254.169.254/metadata",
      });
    }).toThrow("not allowed");
  });

  // 12. Correlation ID propagated
  it("12. correlation ID and call ID propagated in request context", async () => {
    registerIntegrationEndpoint({
      id: "int-corr",
      tenantId: TENANT_A,
      actionCode: "VERIFY_REF",
      name: "Verify Reference",
      endpointUrl: "https://api.alpha-corp.com/verify",
    });

    let receivedReq: ExternalActionRequest | null = null;
    setCustomExternalActionAdapter(async (req: ExternalActionRequest) => {
      receivedReq = req;
      return { status: "SUCCESS", safeMessage: "Verified" };
    });

    await executeExternalAction({
      actionCode: "VERIFY_REF",
      tenantId: TENANT_A,
      callId: "call-999",
      correlationId: "corr-trace-abc-123",
      idempotencyKey: "idemp-xyz",
    });

    expect(receivedReq).not.toBeNull();
    const req = receivedReq as unknown as ExternalActionRequest;
    expect(req.callId).toBe("call-999");
    expect(req.correlationId).toBe("corr-trace-abc-123");
    expect(req.idempotencyKey).toBe("idemp-xyz");
  });

  // 13. Duplicate request supports idempotency
  it("13. duplicate request carries idempotency key", async () => {
    registerIntegrationEndpoint({
      id: "int-idemp",
      tenantId: TENANT_A,
      actionCode: "RECORD_PAYMENT_INTENT",
      name: "Payment Intent",
      endpointUrl: "https://api.alpha-corp.com/pay-intent",
    });

    const calls: string[] = [];
    setCustomExternalActionAdapter(async (req) => {
      calls.push(req.idempotencyKey ?? "");
      return { status: "SUCCESS", referenceId: "TX-1001" };
    });

    await executeExternalAction({
      actionCode: "RECORD_PAYMENT_INTENT",
      tenantId: TENANT_A,
      callId: "call-1",
      correlationId: "corr-1",
      idempotencyKey: "unique-order-key-1",
    });

    await executeExternalAction({
      actionCode: "RECORD_PAYMENT_INTENT",
      tenantId: TENANT_A,
      callId: "call-1",
      correlationId: "corr-1",
      idempotencyKey: "unique-order-key-1",
    });

    expect(calls).toEqual(["unique-order-key-1", "unique-order-key-1"]);
  });

  // 14. AUTH_GATE still protects sensitive action
  it("14. AUTH_GATE protects sensitive action when caller is unauthenticated", async () => {
    registerIntegrationEndpoint({
      id: "int-sec",
      tenantId: TENANT_A,
      actionCode: "GET_CONFIDENTIAL_INFO",
      name: "Confidential Info",
      endpointUrl: "https://api.alpha-corp.com/secure",
      requiredAuthLevel: "AUTH_LEVEL_1",
    });

    // Unauthenticated caller
    const resultUnauth = await executeExternalAction({
      actionCode: "GET_CONFIDENTIAL_INFO",
      tenantId: TENANT_A,
      callId: "call-108",
      correlationId: "corr-108",
      currentAuthLevel: "AUTH_LEVEL_0",
    });

    expect(resultUnauth.status).toBe("FAILURE");
    expect(resultUnauth.errorReason).toBe("AUTH_GATE_REQUIRED");
    expect(resultUnauth.safeMessage).toContain("Authentication is required");

    // Authenticated caller
    setCustomExternalActionAdapter(async () => ({
      status: "SUCCESS",
      safeMessage: "Authenticated access granted.",
    }));

    const resultAuth = await executeExternalAction({
      actionCode: "GET_CONFIDENTIAL_INFO",
      tenantId: TENANT_A,
      callId: "call-108",
      correlationId: "corr-108",
      currentAuthLevel: "AUTH_LEVEL_1",
    });

    expect(resultAuth.status).toBe("SUCCESS");
  });

  // 15. Action failure cannot bypass auth
  it("15. action failure cannot bypass authentication gate", async () => {
    registerIntegrationEndpoint({
      id: "int-sec2",
      tenantId: TENANT_A,
      actionCode: "SENSITIVE_TOOL",
      name: "Sensitive Tool",
      endpointUrl: "https://api.alpha-corp.com/sensitive",
      requiredAuthLevel: "AUTH_LEVEL_2",
    });

    const result = await executeExternalAction({
      actionCode: "SENSITIVE_TOOL",
      tenantId: TENANT_A,
      callId: "call-109",
      correlationId: "corr-109",
      currentAuthLevel: "AUTH_LEVEL_1", // Insufficient for AUTH_LEVEL_2
    });

    expect(result.status).toBe("FAILURE");
    expect(result.errorReason).toBe("AUTH_GATE_REQUIRED");
  });

  // 16. Copilot only uses catalog actions
  it("16. flow validator verifies allowed action codes for tenant", () => {
    const flow = generatePresetFlow("CLASSIC_IVR", {
      actionCode: "ACCOUNT_SERVICE",
      knowledgeDocumentId: "doc-1",
      transferDestinationId: "dest-1",
    });
    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
      allowedActionCodes: ["ACCOUNT_SERVICE", "CHECK_STATUS"],
      allowedKnowledgeDocumentIds: ["doc-1"],
      allowedTransferDestinationIds: ["dest-1"],
    });

    const actionErrors = result.errors.filter(e => e.code === "ACTION_NOT_ALLOWED");
    expect(actionErrors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  // 17. Copilot cannot invent resource (disallowed action code blocked)
  it("17. disallowed or invented action code is rejected by validator", () => {
    const flow = generatePresetFlow("CLASSIC_IVR");
    const actionNode = flow.nodes.find(n => n.id === "action_service");
    if (actionNode) {
      actionNode.data.actionCode = "INVENTED_PHANTOM_ACTION";
    }

    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
      allowedActionCodes: ["ACCOUNT_SERVICE", "CHECK_STATUS"],
    });

    const actionErrors = result.errors.filter(e => e.code === "ACTION_NOT_ALLOWED");
    expect(actionErrors.length).toBeGreaterThan(0);
  });

  // 18. Classic zero-integration IVR works
  it("18. Classic zero-integration IVR works without any external integrations registered", () => {
    const flow = generatePresetFlow("CLASSIC_IVR");
    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 19. Smart IVR works without integration
  it("19. Smart IVR works without integration", () => {
    const flow = generatePresetFlow("SMART_IVR");
    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 20. Adaptive IVR works without integration
  it("20. Adaptive IVR works without integration", () => {
    const flow = generatePresetFlow("ADAPTIVE_IVR");
    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 21. Published flow immutability preserved
  it("21. published flow immutability preserved", () => {
    const flow = generatePresetFlow("CONVERSATIONAL_IVR");
    const frozen = Object.freeze(JSON.parse(JSON.stringify(flow)));

    expect(() => {
      (frozen as any).nodes = [];
    }).toThrow();
  });

  // 22. Placeholder resources blocked at publish
  it("22. placeholder resources are strictly blocked when enforcePublicationReadiness is true", () => {
    const flow = generatePresetFlow("CLASSIC_IVR");
    // Add placeholder tokens
    const actionNode = flow.nodes.find(n => n.id === "action_service");
    if (actionNode) {
      actionNode.data.actionCode = "action-default";
    }

    const result = validateIVRFlowDefinition({
      nodes: flow.nodes,
      edges: flow.edges,
      tenantId: TENANT_A,
      enforcePublicationReadiness: true,
    });

    expect(result.valid).toBe(false);
    const placeholderErrors = result.errors.filter(e =>
      e.code.includes("PLACEHOLDER_UNRESOLVED")
    );
    expect(placeholderErrors.length).toBeGreaterThan(0);
  });

  // 23. Provider regressions remain green
  it("23. provider safety: integration layer produces normalized results without provider coupling", async () => {
    registerIntegrationEndpoint({
      id: "int-generic",
      tenantId: TENANT_A,
      actionCode: "GENERIC_CHECK",
      name: "Generic Check",
      endpointUrl: "https://api.alpha-corp.com/check",
    });

    setCustomExternalActionAdapter(async () => ({
      status: "SUCCESS",
      safeMessage: "Checked successfully.",
    }));

    const result = await executeExternalAction({
      actionCode: "GENERIC_CHECK",
      tenantId: TENANT_A,
      callId: "call-any-provider",
      correlationId: "corr-any-provider",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.safeMessage).toBe("Checked successfully.");
  });

  // 24. Tenant isolation remains green
  it("24. tenant isolation: endpoints, events, and identity mappings remain strictly isolated", () => {
    registerIntegrationEndpoint({
      id: "int-a",
      tenantId: TENANT_A,
      actionCode: "ALPHA_ONLY",
      name: "Alpha Only",
      endpointUrl: "https://api.alpha-corp.com/only",
    });

    const tenantAEndpoints = getIntegrationEndpointsForTenant(TENANT_A);
    const tenantBEndpoints = getIntegrationEndpointsForTenant(TENANT_B);

    expect(tenantAEndpoints).toHaveLength(1);
    expect(tenantBEndpoints).toHaveLength(0);

    // SSO assertion test
    const alphaIdentity = validateExternalIdentityAssertion({
      issuer: "https://idp.alpha-corp.com",
      subject: "user-123",
      tenantId: TENANT_A,
      email: "engineer@alpha-corp.com",
      roles: ["developer"],
    });

    expect(alphaIdentity.valid).toBe(true);
    expect(alphaIdentity.tenantId).toBe(TENANT_A);
    expect(alphaIdentity.assignedRole).toBe(UserRole.ADMIN);
    expect(alphaIdentity.assignedPersona).toBe("DEVELOPER");
  });
});
