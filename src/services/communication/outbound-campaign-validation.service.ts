import { CommunicationCampaignApprovalStatus, CommunicationCampaignStatus } from "@prisma/client";

import { normalizeMessagingPhoneNumber } from "@/services/messaging/messaging-consent.service";

import { normalizePstnNumber } from "@/lib/telephony-number";

import { isWithinBusinessHours, type BusinessHoursPolicy } from "@/services/telephony/agent-availability.service";

import { selectRuntime, type IVRRuntimeMode } from "@/services/ivr/ivr-runtime-selector.service";

//--------------------------------------------------
// Validation
//--------------------------------------------------

export type OutboundCampaignValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface OutboundCampaignValidationIssue {
  code: string;
  field: string | null;
  message: string;
  severity: OutboundCampaignValidationSeverity;
}

export interface OutboundCampaignValidationResult {
  valid: boolean;
  errors: OutboundCampaignValidationIssue[];
  warnings: OutboundCampaignValidationIssue[];
  issues: OutboundCampaignValidationIssue[];
  audienceCount: number;
  eligibleCount: number;
  excludedCount: number;
}

//--------------------------------------------------
// Audience Snapshot
//--------------------------------------------------

export interface OutboundAudienceContactInput {
  id: string;
  tenantId?: string | null;
  ownerUserId?: string | null;
  fullName?: string | null;
  phone?: string | null;
  language?: string | null;
  consentStatus?: "OPTED_IN" | "OPTED_OUT" | "UNKNOWN" | null;
  dnc?: boolean | null;
  suppressed?: boolean | null;
  timezone?: string | null;
  attemptCount?: number | null;
  totalAttemptCount?: number | null;
  lastDisposition?: string | null;
}

export interface OutboundAudienceSnapshot {
  sourceId: string | null;
  sourceName: string;
  recipients: Array<{
    id: string;
    tenantId: string | null;
    ownerUserId: string | null;
    fullName: string | null;
    phone: string;
    language: string;
    consentStatus: "OPTED_IN" | "OPTED_OUT" | "UNKNOWN" | null;
    dnc: boolean;
    suppressed: boolean;
    timezone: string | null;
    attemptCount: number;
    totalAttemptCount: number;
    lastDisposition: string | null;
  }>;
  recipientCount: number;
}

//--------------------------------------------------
// Tenant / Campaign Context
//--------------------------------------------------

export interface OutboundCampaignTenantContext {
  tenantId: string;
  timezone?: string | null;
  provider?: string | null;
  premiumVoiceEnabled?: boolean | null;
}

export interface OutboundCampaignRuntimeContext {
  mode?: IVRRuntimeMode | null;
  defaultRuntime?: "STANDARD" | "PREMIUM" | null;
  provider?: string | null;
  premiumVoiceEnabled?: boolean | null;
}

export interface OutboundCampaignEligibilityContact extends OutboundAudienceContactInput {
  normalizedPhone?: string | null;
}

export interface OutboundCampaignContext {
  id: string;
  tenantId: string;
  ownerUserId?: string | null;
  name?: string;
  status?: CommunicationCampaignStatus | string | null;
  approvalStatus?: CommunicationCampaignApprovalStatus | string | null;
  runtime?: OutboundCampaignRuntimeContext | null;
  provider?: string | null;
  callerId?: string | null;
  timezone?: string | null;
  businessHoursPolicy?: BusinessHoursPolicy | null;
  consentRequired?: boolean | null;
  dncRequired?: boolean | null;
  excludedContactIds?: readonly string[] | null;
  excludedPhones?: readonly string[] | null;
  concurrency?: number | null;
  dailyAttemptLimit?: number | null;
  totalAttemptLimit?: number | null;
  terminalDispositions?: readonly string[] | null;
  recipientCount?: number | null;
  ivrFlowId?: string | null;
  ivrFlowVersionId?: string | null;
  publishedIvrVersionId?: string | null;
  ivrFlowTenantId?: string | null;
  ivrVersionStatus?: string | null;
  transferConfigured?: boolean | null;
  transferAuthorized?: boolean | null;
  callbackConfigured?: boolean | null;
  callbackAuthorized?: boolean | null;
  followUpTemplateAuthorized?: boolean | null;
}

export interface EvaluateOutboundContactEligibilityInput {
  tenant: OutboundCampaignTenantContext;
  campaign: OutboundCampaignContext;
  contact: OutboundCampaignEligibilityContact;
  now: Date;
  strictCampaignState?: boolean;
  strictBusinessHours?: boolean;
}

export interface EvaluateOutboundContactEligibilityResult {
  allowed: boolean;
  reasonCode: string;
  reasonText: string;
}

export interface ValidateOutboundCampaignInput {
  tenant: OutboundCampaignTenantContext;
  campaign: OutboundCampaignContext;
  audience: OutboundAudienceContactInput[];
  now?: Date;
}

export interface OutboundCampaignReviewSummary {
  campaign: {
    id: string;
    name: string;
    status: string | null;
    approvalStatus: string | null;
    tenantId: string;
    ownerUserId: string | null;
  };
  audienceCount: number;
  eligibleCount: number;
  excludedCount: number;
  publishedIvrVersionId: string | null;
  runtime: {
    mode: IVRRuntimeMode | null;
    selected: "STANDARD" | "PREMIUM";
    reasonCode: string;
    reasonText: string;
  };
  provider: string | null;
  callerId: string | null;
  schedule: {
    timezone: string | null;
    businessHours: BusinessHoursPolicy | null;
  };
  retryPolicy: {
    dailyAttemptLimit: number | null;
    totalAttemptLimit: number | null;
  };
  concurrency: number | null;
  transfer: {
    configured: boolean;
    authorized: boolean;
  };
  callback: {
    configured: boolean;
    authorized: boolean;
  };
  complianceWarnings: string[];
  validation: OutboundCampaignValidationResult;
}

//--------------------------------------------------
// Audience Snapshot
//--------------------------------------------------

export function buildOutboundAudienceSnapshot(
  input: {
    sourceId?: string | null;
    sourceName: string;
    tenantId?: string | null;
    contacts: OutboundAudienceContactInput[];
  }
): OutboundAudienceSnapshot {
  const recipients = new Map<
    string,
    OutboundAudienceSnapshot["recipients"][number]
  >();

  for (const contact of input.contacts) {
    const contactTenantId = contact.tenantId?.trim() ?? null;
    const tenantId = input.tenantId?.trim() ?? null;

    if (tenantId && contactTenantId && tenantId !== contactTenantId) {
      throw new Error("Cross-tenant contacts cannot be added to an outbound campaign");
    }

    const normalizedPhone = normalizeMessagingPhoneNumber(contact.phone ?? "");

    if (!normalizedPhone) {
      throw new Error(`Invalid audience phone number: ${contact.phone ?? "unknown"}`);
    }

    recipients.set(normalizedPhone, {
      id: contact.id,
      tenantId: contactTenantId,
      ownerUserId: contact.ownerUserId?.trim() ?? null,
      fullName: contact.fullName?.trim() || null,
      phone: normalizedPhone,
      language: contact.language?.trim() || "English",
      consentStatus: contact.consentStatus ?? null,
      dnc: Boolean(contact.dnc),
      suppressed: Boolean(contact.suppressed),
      timezone: contact.timezone?.trim() || null,
      attemptCount: toFiniteInteger(contact.attemptCount) ?? 0,
      totalAttemptCount: toFiniteInteger(contact.totalAttemptCount) ?? 0,
      lastDisposition: contact.lastDisposition?.trim() || null,
    });
  }

  const snapshotRecipients = Array.from(recipients.values());

  return {
    sourceId: input.sourceId?.trim() || null,
    sourceName: input.sourceName.trim() || "Audience",
    recipients: snapshotRecipients,
    recipientCount: snapshotRecipients.length,
  };
}

//--------------------------------------------------
// Eligibility
//--------------------------------------------------

export function evaluateOutboundContactEligibility(
  input: EvaluateOutboundContactEligibilityInput
): EvaluateOutboundContactEligibilityResult {
  const normalizedTenantId = input.tenant.tenantId.trim();
  const normalizedCampaignTenantId = input.campaign.tenantId.trim();

  if (!normalizedTenantId || !normalizedCampaignTenantId || normalizedTenantId !== normalizedCampaignTenantId) {
    return blocked("TENANT_MISMATCH", "Contact does not belong to the same tenant as the campaign.");
  }

  if (input.contact.tenantId?.trim() && input.contact.tenantId.trim() !== normalizedTenantId) {
    return blocked("CONTACT_TENANT_MISMATCH", "Contact cannot be used across tenants.");
  }

  if (input.campaign.ownerUserId && input.contact.ownerUserId && input.campaign.ownerUserId !== input.contact.ownerUserId) {
    return blocked("CONTACT_OWNERSHIP_MISMATCH", "Contact is not owned by the campaign owner.");
  }

  if (input.strictCampaignState !== false && !isLaunchableStatus(input.campaign.status)) {
    return blocked("CAMPAIGN_NOT_LAUNCHABLE", "Campaign is not in a launchable state.");
  }

  const normalizedPhone = normalizeMessagingPhoneNumber(input.contact.phone ?? "");
  if (!normalizedPhone) {
    return blocked("INVALID_PHONE", "Contact phone number is invalid.");
  }

  if (input.campaign.excludedContactIds?.includes(input.contact.id) || input.campaign.excludedPhones?.includes(normalizedPhone)) {
    return blocked("CAMPAIGN_EXCLUDED", "Contact is excluded from this campaign.");
  }

  if (input.contact.dnc) {
    return blocked("DNC_ACTIVE", "Contact is on the do-not-call list.");
  }

  if (input.contact.suppressed) {
    return blocked("SUPPRESSION_ACTIVE", "Contact is suppressed from outbound campaigns.");
  }

  const consentRequired = input.campaign.consentRequired !== false;
  if (consentRequired && input.contact.consentStatus !== "OPTED_IN") {
    return blocked(
      input.contact.consentStatus === "OPTED_OUT" ? "CONSENT_REVOKED" : "CONSENT_REQUIRED",
      input.contact.consentStatus === "OPTED_OUT"
        ? "Contact has opted out of outbound contact."
        : "Outbound consent is required for this contact."
    );
  }

  const campaignTimezone = input.campaign.timezone?.trim() || input.tenant.timezone?.trim() || null;
  const policy = input.campaign.businessHoursPolicy;
  if (policy) {
    if (!isValidTimezone(policy.timezone)) {
      return blocked("INVALID_TIMEZONE", "Business-hours policy timezone is invalid.");
    }

    if (input.strictBusinessHours !== false && !isWithinBusinessHours(policy, input.now)) {
      return blocked("OUTSIDE_CALLING_HOURS", "Campaign is outside the allowed calling window.");
    }
  } else if (campaignTimezone && !isValidTimezone(campaignTimezone)) {
    return blocked("INVALID_TIMEZONE", "Campaign timezone is invalid.");
  }

  const dailyAttemptLimit = toFiniteInteger(input.campaign.dailyAttemptLimit);
  const totalAttemptLimit = toFiniteInteger(input.campaign.totalAttemptLimit);
  const dailyAttempts = toFiniteInteger(input.contact.attemptCount);
  const totalAttempts = toFiniteInteger(input.contact.totalAttemptCount);

  if (dailyAttemptLimit !== null && dailyAttempts !== null && dailyAttempts >= dailyAttemptLimit) {
    return blocked("DAILY_ATTEMPT_LIMIT_REACHED", "Daily attempt limit has been reached for this contact.");
  }

  if (totalAttemptLimit !== null && totalAttempts !== null && totalAttempts >= totalAttemptLimit) {
    return blocked("TOTAL_ATTEMPT_LIMIT_REACHED", "Total attempt limit has been reached for this contact.");
  }

  if (input.campaign.terminalDispositions?.length && input.contact.lastDisposition && input.campaign.terminalDispositions.includes(input.contact.lastDisposition)) {
    return blocked("TERMINAL_DISPOSITION_BLOCKED", "Contact has already reached a terminal disposition.");
  }

  if (input.campaign.provider && input.tenant.provider && normalizeToken(input.campaign.provider) !== normalizeToken(input.tenant.provider)) {
    return blocked("TENANT_PROVIDER_MISMATCH", "Campaign provider does not match the tenant provider.");
  }

  const runtime = input.campaign.runtime ?? {};
  if (runtime.mode === "PREMIUM" && input.tenant.premiumVoiceEnabled === false) {
    return blocked("PREMIUM_ENTITLEMENT_REQUIRED", "Premium runtime requires a premium entitlement.");
  }

  if (runtime.mode === "AUTO") {
    const selection = selectRuntime({
      tenant: {
        premiumVoiceEnabled: input.tenant.premiumVoiceEnabled ?? false,
      },
      provider: runtime.provider ?? input.campaign.provider ?? input.tenant.provider,
      flow: {
        runtimeMode: "AUTO",
        runtimeDefault: runtime.defaultRuntime ?? "STANDARD",
        nodes: [],
      },
      policy: {
        defaultRuntime: runtime.defaultRuntime ?? "STANDARD",
      },
    });

    if (selection.reasonCode.includes("UNSUPPORTED")) {
      return blocked("RUNTIME_UNSUPPORTED", selection.reasonText);
    }
  }

  return {
    allowed: true,
    reasonCode: "ELIGIBLE",
    reasonText: "Contact is eligible for outbound launch.",
  };
}

//--------------------------------------------------
// Validation
//--------------------------------------------------

export function validateOutboundCampaign(
  input: ValidateOutboundCampaignInput
): OutboundCampaignValidationResult {
  const now = input.now ?? new Date();
  const validationIssues: OutboundCampaignValidationIssue[] = [];

  let audienceSnapshot: OutboundAudienceSnapshot = {
    sourceId: null,
    sourceName: input.campaign.name ?? "Audience",
    recipients: [],
    recipientCount: 0,
  };

  try {
    audienceSnapshot = buildOutboundAudienceSnapshot({
      sourceId: null,
      sourceName: input.campaign.name ?? "Audience",
      tenantId: input.tenant.tenantId,
      contacts: input.audience,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audience snapshot is invalid.";
    validationIssues.push(
      errorMessageToIssue(message)
    );
  }

  if (audienceSnapshot.recipientCount === 0) {
    validationIssues.push(error("AUDIENCE_MISSING", "audience", "Campaign audience is missing."));
  }

  const runtime = input.campaign.runtime ?? {};
  const runtimeSelection = selectRuntime({
    tenant: {
      premiumVoiceEnabled: input.tenant.premiumVoiceEnabled ?? false,
    },
    provider: runtime.provider ?? input.campaign.provider ?? input.tenant.provider,
    flow: {
      runtimeMode: runtime.mode ?? null,
      runtimeDefault: runtime.defaultRuntime ?? "STANDARD",
      nodes: [],
    },
    policy: {
      defaultRuntime: runtime.defaultRuntime ?? "STANDARD",
      explicitPremiumRequired: runtime.mode === "PREMIUM",
    },
  });

  if (runtime.mode === "PREMIUM" && input.tenant.premiumVoiceEnabled === false) {
    validationIssues.push(error("PREMIUM_ENTITLEMENT_REQUIRED", "runtime", "Premium runtime requires a premium entitlement."));
  }

  if (runtime.mode === "AUTO") {
    validationIssues.push(info("AUTO_RUNTIME_RESOLVED", "runtime", runtimeSelection.reasonText));
  }

  if (runtime.mode && runtimeSelection.reasonCode.includes("UNSUPPORTED")) {
    validationIssues.push(error("RUNTIME_UNSUPPORTED", "runtime", runtimeSelection.reasonText));
  }

  if (runtime.provider && input.campaign.provider && normalizeToken(runtime.provider) !== normalizeToken(input.campaign.provider)) {
    validationIssues.push(error("PROVIDER_RUNTIME_MISMATCH", "runtime", "Campaign runtime provider does not match the configured campaign provider."));
  }

  if (!input.campaign.provider?.trim()) {
    validationIssues.push(error("PROVIDER_MISSING", "provider", "A campaign provider must be configured."));
  }

  if (input.campaign.callerId !== undefined) {
    const callerId = normalizePstnNumber(input.campaign.callerId);
    if (!callerId) {
      validationIssues.push(error("CALLER_ID_INVALID", "callerId", "Caller ID must be a valid E.164 number."));
    }
  } else {
    validationIssues.push(error("CALLER_ID_MISSING", "callerId", "A caller ID must be configured."));
  }

  if (input.campaign.timezone !== undefined && input.campaign.timezone !== null && !isValidTimezone(input.campaign.timezone)) {
    validationIssues.push(error("TIMEZONE_INVALID", "timezone", "Campaign timezone must be a valid IANA timezone."));
  }

  if (input.campaign.businessHoursPolicy) {
    const policy = input.campaign.businessHoursPolicy;
    if (!isValidTimezone(policy.timezone)) {
      validationIssues.push(error("BUSINESS_HOURS_TIMEZONE_INVALID", "businessHoursPolicy", "Business-hours policy timezone must be valid."));
    } else if (!isBusinessHoursPolicyValid(policy)) {
      validationIssues.push(error("BUSINESS_HOURS_POLICY_INVALID", "businessHoursPolicy", "Business-hours policy must define a usable calling window."));
    } else if (!isWithinBusinessHours(policy, now)) {
      validationIssues.push(warning("OUTSIDE_CALLING_HOURS", "businessHoursPolicy", "Campaign is outside the allowed calling window right now."));
    }
  }

  const concurrency = toFiniteInteger(input.campaign.concurrency);
  if (concurrency !== null && concurrency <= 0) {
    validationIssues.push(error("CONCURRENCY_INVALID", "concurrency", "Concurrency must be greater than zero."));
  }

  if (input.campaign.dailyAttemptLimit !== undefined && toFiniteInteger(input.campaign.dailyAttemptLimit) !== null && toFiniteInteger(input.campaign.dailyAttemptLimit)! <= 0) {
    validationIssues.push(error("RETRY_POLICY_INVALID", "retryPolicy", "Daily attempt limits must be greater than zero."));
  }

  if (input.campaign.totalAttemptLimit !== undefined && toFiniteInteger(input.campaign.totalAttemptLimit) !== null && toFiniteInteger(input.campaign.totalAttemptLimit)! <= 0) {
    validationIssues.push(error("RETRY_POLICY_INVALID", "retryPolicy", "Total attempt limits must be greater than zero."));
  }

  if (input.campaign.consentRequired === false) {
    validationIssues.push(info("CONSENT_POLICY_NOT_REQUIRED", "consent", "Outbound consent policy is not required for this campaign."));
  }

  const eligibleContacts = audienceSnapshot.recipients.filter(contact =>
    evaluateOutboundContactEligibility({
      tenant: input.tenant,
      campaign: input.campaign,
      contact,
      now,
      strictCampaignState: false,
      strictBusinessHours: false,
    }).allowed
  );

  if (eligibleContacts.length === 0 && audienceSnapshot.recipientCount > 0) {
    validationIssues.push(error("NO_ELIGIBLE_CONTACTS", "audience", "No eligible contacts remain after eligibility filtering."));
  }

  if (input.campaign.ivrFlowId) {
    if (!input.campaign.ivrFlowVersionId || !input.campaign.publishedIvrVersionId) {
      validationIssues.push(error("PUBLISHED_IVR_REQUIRED", "ivrFlowId", "A published IVR version must be selected."));
    }

    if (input.campaign.ivrFlowTenantId && input.campaign.ivrFlowTenantId.trim() !== input.tenant.tenantId.trim()) {
      validationIssues.push(error("CROSS_TENANT_IVR_REJECTED", "ivrFlowId", "IVR flow must belong to the same tenant as the campaign."));
    }

    if (input.campaign.ivrVersionStatus && input.campaign.ivrVersionStatus !== "PUBLISHED") {
      validationIssues.push(error("PUBLISHED_IVR_REQUIRED", "ivrFlowVersionId", "Only published IVR versions can be used for outbound campaigns."));
    }
  }

  if (input.campaign.transferConfigured && input.campaign.transferAuthorized === false) {
    validationIssues.push(error("TRANSFER_DESTINATION_UNAUTHORIZED", "transfer", "Transfer destination is not authorized for this tenant."));
  }

  if (input.campaign.callbackConfigured && input.campaign.callbackAuthorized === false) {
    validationIssues.push(error("CALLBACK_CONFIGURATION_INVALID", "callback", "Callback configuration is not authorized for this tenant."));
  }

  if (input.campaign.followUpTemplateAuthorized === false) {
    validationIssues.push(error("FOLLOW_UP_TEMPLATE_UNAUTHORIZED", "followUp", "Follow-up template is not authorized for this tenant."));
  }

  if (input.campaign.approvalStatus && input.campaign.approvalStatus === CommunicationCampaignApprovalStatus.REJECTED) {
    validationIssues.push(warning("CAMPAIGN_REJECTED", "approvalStatus", "Rejected campaigns cannot be launched until they are revised and resubmitted."));
  }

  const validation = finalizeIssues(validationIssues);

  return {
    valid: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings,
    issues: validation.issues,
    audienceCount: audienceSnapshot.recipientCount,
    eligibleCount: eligibleContacts.length,
    excludedCount: audienceSnapshot.recipientCount - eligibleContacts.length,
  };
}

//--------------------------------------------------
// Review Summary
//--------------------------------------------------

export function buildOutboundCampaignReviewSummary(
  input: ValidateOutboundCampaignInput
): OutboundCampaignReviewSummary {
  const validation = validateOutboundCampaign(input);
  const runtime = input.campaign.runtime ?? {};
  const runtimeSelection = selectRuntime({
    tenant: {
      premiumVoiceEnabled: input.tenant.premiumVoiceEnabled ?? false,
    },
    provider: runtime.provider ?? input.campaign.provider ?? input.tenant.provider,
    flow: {
      runtimeMode: runtime.mode ?? null,
      runtimeDefault: runtime.defaultRuntime ?? "STANDARD",
      nodes: [],
    },
    policy: {
      defaultRuntime: runtime.defaultRuntime ?? "STANDARD",
      explicitPremiumRequired: runtime.mode === "PREMIUM",
    },
  });

  return {
    campaign: {
      id: input.campaign.id,
      name: input.campaign.name ?? "Outbound Campaign",
      status: input.campaign.status ?? null,
      approvalStatus: input.campaign.approvalStatus ?? null,
      tenantId: input.campaign.tenantId,
      ownerUserId: input.campaign.ownerUserId ?? null,
    },
    audienceCount: validation.audienceCount,
    eligibleCount: validation.eligibleCount,
    excludedCount: validation.excludedCount,
    publishedIvrVersionId: input.campaign.publishedIvrVersionId ?? null,
    runtime: {
      mode: runtime.mode ?? null,
      selected: runtimeSelection.selectedRuntime,
      reasonCode: runtimeSelection.reasonCode,
      reasonText: runtimeSelection.reasonText,
    },
    provider: input.campaign.provider ?? null,
    callerId: input.campaign.callerId ?? null,
    schedule: {
      timezone: input.campaign.timezone ?? input.tenant.timezone ?? null,
      businessHours: input.campaign.businessHoursPolicy ?? null,
    },
    retryPolicy: {
      dailyAttemptLimit: input.campaign.dailyAttemptLimit ?? null,
      totalAttemptLimit: input.campaign.totalAttemptLimit ?? null,
    },
    concurrency: input.campaign.concurrency ?? null,
    transfer: {
      configured: Boolean(input.campaign.transferConfigured),
      authorized: input.campaign.transferAuthorized !== false,
    },
    callback: {
      configured: Boolean(input.campaign.callbackConfigured),
      authorized: input.campaign.callbackAuthorized !== false,
    },
    complianceWarnings: validation.warnings.map(issue => issue.message),
    validation,
  };
}

//--------------------------------------------------
// Issue Helpers
//--------------------------------------------------

function error(code: string, field: string | null, message: string): OutboundCampaignValidationIssue {
  return {
    code,
    field,
    message,
    severity: "ERROR",
  };
}

function warning(code: string, field: string | null, message: string): OutboundCampaignValidationIssue {
  return {
    code,
    field,
    message,
    severity: "WARNING",
  };
}

function info(code: string, field: string | null, message: string): OutboundCampaignValidationIssue {
  return {
    code,
    field,
    message,
    severity: "INFO",
  };
}

function finalizeIssues(
  issues: OutboundCampaignValidationIssue[]
): OutboundCampaignValidationResult {
  const errors = issues.filter(issue => issue.severity === "ERROR");
  const warnings = issues.filter(issue => issue.severity === "WARNING");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    audienceCount: 0,
    eligibleCount: 0,
    excludedCount: 0,
  };
}

function blocked(
  reasonCode: string,
  reasonText: string
): EvaluateOutboundContactEligibilityResult {
  return {
    allowed: false,
    reasonCode,
    reasonText,
  };
}

function isLaunchableStatus(
  status: string | CommunicationCampaignStatus | null | undefined
): boolean {
  const normalized = status?.trim().toUpperCase();
  return normalized === CommunicationCampaignStatus.READY ||
    normalized === CommunicationCampaignStatus.SCHEDULED ||
    normalized === CommunicationCampaignStatus.QUEUED ||
    normalized === CommunicationCampaignStatus.RUNNING;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isBusinessHoursPolicyValid(policy: BusinessHoursPolicy): boolean {
  if (!Array.isArray(policy.enabledDays) || policy.enabledDays.length === 0) {
    return false;
  }

  const start = parseMinutes(policy.startTime);
  const end = parseMinutes(policy.endTime);

  return start !== null && end !== null;
}

function parseMinutes(value: string): number | null {
  const parts = value.trim().split(":").map(Number);

  if (parts.length !== 2 || parts.some(part => !Number.isInteger(part))) {
    return null;
  }

  const [hour, minute] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function toFiniteInteger(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.trunc(value);
}

function normalizeToken(value: string): string {
  return value.trim().toUpperCase();
}

function errorMessageToIssue(message: string): OutboundCampaignValidationIssue {
  if (message.includes("Cross-tenant contacts cannot be added")) {
    return error("CROSS_TENANT_CONTACT_REJECTED", "audience", message);
  }

  if (message.includes("Invalid audience phone number")) {
    return error("INVALID_PHONE", "audience", message);
  }

  return error("AUDIENCE_INVALID", "audience", message);
}
