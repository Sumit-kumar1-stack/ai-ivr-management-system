import { resolve } from "node:path";

export type EnvironmentService = "build" | "web" | "media" | "worker";
type EnvironmentValues = Record<string, string | undefined>;

export interface EnvironmentValidationIssue {
  variable: string;
  reason: string;
}

export class EnvironmentValidationError extends Error {
  readonly service: EnvironmentService;
  readonly issues: EnvironmentValidationIssue[];

  constructor(service: EnvironmentService, issues: EnvironmentValidationIssue[]) {
    super(`${service.toUpperCase()} configuration invalid:\n${issues.map(issue => `- ${issue.variable}: ${issue.reason}`).join("\n")}`);
    this.name = "EnvironmentValidationError";
    this.service = service;
    this.issues = issues;
  }
}

export function validateEnvironmentFor(
  service: EnvironmentService,
  env: EnvironmentValues = process.env
): void {
  // Build-time code must stay credential-free. Runtime contracts are checked by
  // their owning process immediately before it loads process-owned resources.
  if (service === "build") return;

  const issues: EnvironmentValidationIssue[] = [];
  const production = env.NODE_ENV === "production";
  const require = (name: string) => requiredString(env, name, issues);

  require("DATABASE_URL");
  require("REDIS_URL");

  if (service === "web") {
    requireSecret(env, "JWT_SECRET", issues, 32);
    requirePublicUrl(env, ["APP_URL", "NEXT_PUBLIC_APP_URL", "BASE_URL"], "APP_URL", issues, production);
    requirePrivateKnowledgeStorage(env, issues, production);
  }

  if (service === "media") {
    requireTelephony(env, issues, production, true);
    positiveInteger(env, "TWILIO_MEDIA_PORT", issues, 1, 65_535);
    positiveInteger(env, "MEDIA_DRAIN_TIMEOUT_MS", issues);
    if ((env.TELEPHONY_PROVIDER ?? "twilio").trim().toLowerCase() === "twilio") {
      requirePublicUrl(env, ["TWILIO_MEDIA_PUBLIC_URL"], "TWILIO_MEDIA_PUBLIC_URL", issues, production, true);
    } else if ((env.TELEPHONY_PROVIDER ?? "twilio").trim().toLowerCase() === "exotel") {
      requirePublicUrl(env, ["EXOTEL_MEDIA_PUBLIC_URL"], "EXOTEL_MEDIA_PUBLIC_URL", issues, production, true);
      requireSecret(env, "EXOTEL_STREAM_USERNAME", issues);
      requireSecret(env, "EXOTEL_STREAM_PASSWORD", issues);
    } else if ((env.TELEPHONY_PROVIDER ?? "twilio").trim().toLowerCase() === "plivo") {
      requirePublicUrl(env, ["PLIVO_MEDIA_PUBLIC_URL"], "PLIVO_MEDIA_PUBLIC_URL", issues, production, true);
    }
    requireMediaProviders(env, issues);
  }

  if (service === "worker") {
    requireTelephony(env, issues, production, false);
    positiveInteger(env, "WORKER_HEALTH_PORT", issues, 1, 65_535);
    validateRetentionSettings(env, issues);
  }

  validateUrl(env, "DATABASE_URL", issues, ["postgres:", "postgresql:"]);
  validateUrl(env, "REDIS_URL", issues, ["redis:", "rediss:"]);

  if (issues.length > 0) throw new EnvironmentValidationError(service, issues);
}

function requireMediaProviders(env: EnvironmentValues, issues: EnvironmentValidationIssue[]): void {
  const tier = (env.COMMUNICATION_TIER ?? "STANDARD").trim().toUpperCase();
  if (tier !== "STANDARD" && tier !== "PREMIUM") {
    issues.push({ variable: "COMMUNICATION_TIER", reason: "must be STANDARD or PREMIUM" });
    return;
  }

  const fallbackEnabled = parseBoolean(env.PREMIUM_CASCADED_FALLBACK_ENABLED, "PREMIUM_CASCADED_FALLBACK_ENABLED", issues, true);
  const needsCascaded = tier === "STANDARD" || (tier === "PREMIUM" && fallbackEnabled);

  // Gemini is the current configured text, TTS, and Gemini Live provider.
  requireSecret(env, "GEMINI_API_KEY", issues);
  if (needsCascaded) requireSecret(env, "DEEPGRAM_API_KEY", issues);
}

function requireTelephony(env: EnvironmentValues, issues: EnvironmentValidationIssue[], production: boolean, needsMediaUrl: boolean): void {
  const provider = (env.TELEPHONY_PROVIDER ?? "twilio").trim().toLowerCase();
  if (provider === "mock") {
    if (production) issues.push({ variable: "TELEPHONY_PROVIDER", reason: "must be twilio, exotel, or plivo in production" });
    return;
  }
  if (provider === "exotel") {
    requireSecret(env, "EXOTEL_ACCOUNT_SID", issues);
    requireSecret(env, "EXOTEL_API_KEY", issues);
    requireSecret(env, "EXOTEL_API_TOKEN", issues);
    requireSecret(env, "EXOTEL_WEBHOOK_SECRET", issues, 16);
    const phone = requiredString(env, "EXOTEL_CALLER_ID", issues);
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) issues.push({ variable: "EXOTEL_CALLER_ID", reason: "must be a valid E.164 phone number" });
    const subdomain = requiredString(env, "EXOTEL_SUBDOMAIN", issues);
    if (subdomain && !/^[a-z0-9.-]+$/i.test(subdomain.replace(/^https:\/\//, "").replace(/\/+$/, ""))) issues.push({ variable: "EXOTEL_SUBDOMAIN", reason: "must be an Exotel API hostname without a protocol" });
    requirePublicUrl(env, ["EXOTEL_PUBLIC_BASE_URL"], "EXOTEL_PUBLIC_BASE_URL", issues, production);
    if (needsMediaUrl) {
      requirePublicUrl(env, ["EXOTEL_MEDIA_PUBLIC_URL"], "EXOTEL_MEDIA_PUBLIC_URL", issues, production, true);
      requireSecret(env, "EXOTEL_STREAM_USERNAME", issues);
      requireSecret(env, "EXOTEL_STREAM_PASSWORD", issues);
    }
    return;
  }
  if (provider === "plivo") {
    requireSecret(env, "PLIVO_AUTH_ID", issues);
    requireSecret(env, "PLIVO_AUTH_TOKEN", issues);
    const phone = requiredString(env, "PLIVO_CALLER_ID", issues);
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) issues.push({ variable: "PLIVO_CALLER_ID", reason: "must be a valid E.164 phone number" });
    requirePublicUrl(env, ["PLIVO_PUBLIC_BASE_URL"], "PLIVO_PUBLIC_BASE_URL", issues, production);
    if (needsMediaUrl) requirePublicUrl(env, ["PLIVO_MEDIA_PUBLIC_URL"], "PLIVO_MEDIA_PUBLIC_URL", issues, production, true);
    return;
  }
  if (provider !== "twilio") {
    issues.push({ variable: "TELEPHONY_PROVIDER", reason: "must be twilio, exotel, plivo, or mock" });
    return;
  }

  requireSecret(env, "TWILIO_ACCOUNT_SID", issues);
  requireSecret(env, "TWILIO_AUTH_TOKEN", issues);
  const phone = requiredString(env, "TWILIO_PHONE_NUMBER", issues);
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) issues.push({ variable: "TWILIO_PHONE_NUMBER", reason: "must be a valid E.164 phone number" });
  requirePublicUrl(env, ["TWILIO_PUBLIC_BASE_URL"], "TWILIO_PUBLIC_BASE_URL", issues, production);
  if (needsMediaUrl) requirePublicUrl(env, ["TWILIO_MEDIA_PUBLIC_URL"], "TWILIO_MEDIA_PUBLIC_URL", issues, production, true);
}

function requirePrivateKnowledgeStorage(env: EnvironmentValues, issues: EnvironmentValidationIssue[], production: boolean): void {
  const value = requiredString(env, "KNOWLEDGE_STORAGE_DIR", issues);
  if (!value || !production) return;
  const storage = resolve(value);
  const project = process.cwd();
  const forbidden = [resolve(project, "public"), resolve(project, ".next"), resolve(project, "tmp")];
  if (forbidden.some(root => storage === root || storage.startsWith(`${root}\\`) || storage.startsWith(`${root}/`))) {
    issues.push({ variable: "KNOWLEDGE_STORAGE_DIR", reason: "must use a private persistent path outside public/, .next/, and temporary paths" });
  }
}

function requirePublicUrl(env: EnvironmentValues, names: string[], displayName: string, issues: EnvironmentValidationIssue[], production: boolean, websocketCompatible = false): void {
  const value = names.map(name => env[name]?.trim()).find(Boolean);
  if (!value) {
    issues.push({ variable: displayName, reason: "required" });
    return;
  }

  let url: URL;
  try { url = new URL(value); } catch { issues.push({ variable: displayName, reason: "must be a valid absolute URL" }); return; }
  const allowed = websocketCompatible ? ["https:", "wss:", "http:", "ws:"] : ["https:", "http:"];
  if (!allowed.includes(url.protocol)) issues.push({ variable: displayName, reason: websocketCompatible ? "must use HTTP(S) or WS(S)" : "must use HTTP(S)" });
  if (production) {
    if (url.protocol !== "https:" && url.protocol !== "wss:") issues.push({ variable: displayName, reason: "must use HTTPS/WSS in production" });
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) issues.push({ variable: displayName, reason: "must not use a local host in production" });
    if (host.includes("ngrok-free.") || host.endsWith("trycloudflare.com")) issues.push({ variable: displayName, reason: "must not use a temporary tunnel host in production" });
  }
}

function requiredString(env: EnvironmentValues, name: string, issues: EnvironmentValidationIssue[]): string | undefined {
  const value = env[name]?.trim();
  if (!value) issues.push({ variable: name, reason: "required" });
  return value || undefined;
}

function requireSecret(env: EnvironmentValues, name: string, issues: EnvironmentValidationIssue[], minimumLength = 1): void {
  const value = requiredString(env, name, issues);
  if (value && value.length < minimumLength) issues.push({ variable: name, reason: `must contain at least ${minimumLength} characters` });
}

function validateUrl(env: EnvironmentValues, name: string, issues: EnvironmentValidationIssue[], protocols: string[]): void {
  const value = env[name]?.trim();
  if (!value) return;
  try {
    if (!protocols.includes(new URL(value).protocol)) issues.push({ variable: name, reason: `must use ${protocols.join(" or ")}` });
  } catch { issues.push({ variable: name, reason: "must be a valid URL" }); }
}

function positiveInteger(env: EnvironmentValues, name: string, issues: EnvironmentValidationIssue[], minimum = 1, maximum?: number): void {
  const value = env[name]?.trim();
  if (!value) { issues.push({ variable: name, reason: "required" }); return; }
  if (!/^[1-9]\d*$/.test(value)) { issues.push({ variable: name, reason: "must be a positive integer" }); return; }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) issues.push({ variable: name, reason: maximum ? `must be between ${minimum} and ${maximum}` : "must be a positive integer" });
}

function parseBoolean(value: string | undefined, name: string, issues: EnvironmentValidationIssue[], fallback: boolean): boolean {
  if (!value?.trim()) return fallback;
  if (/^(true|1)$/i.test(value)) return true;
  if (/^(false|0)$/i.test(value)) return false;
  issues.push({ variable: name, reason: "must be true, false, 1, or 0" });
  return fallback;
}

function validateRetentionSettings(env: EnvironmentValues, issues: EnvironmentValidationIssue[]): void {
  const batchName = env.RETENTION_BATCH_SIZE?.trim() ? "RETENTION_BATCH_SIZE" : "RETENTION_DELETION_BATCH_SIZE";
  const batch = validateOptionalBoundedPositiveInteger(env, batchName, issues, 1_000);
  const maximum = validateOptionalBoundedPositiveInteger(env, "RETENTION_MAX_RECORDS_PER_RUN", issues, 100_000);
  if (batch !== undefined && maximum !== undefined && batch > maximum) {
    issues.push({ variable: batchName, reason: "must be less than or equal to RETENTION_MAX_RECORDS_PER_RUN" });
  }
}

function validateOptionalBoundedPositiveInteger(env: EnvironmentValues, name: string, issues: EnvironmentValidationIssue[], maximum: number): number | undefined {
  const value = env[name]?.trim();
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    issues.push({ variable: name, reason: "must be a positive integer" });
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    issues.push({ variable: name, reason: `must be less than or equal to ${maximum}` });
    return undefined;
  }
  return parsed;
}
