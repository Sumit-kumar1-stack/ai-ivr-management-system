import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";

import {
  join,
  resolve,
} from "node:path";

export type ProductionEnvironmentCheckLevel =
  | "PASS"
  | "WARN"
  | "FAIL";

export interface ProductionEnvironmentCheck {
  name: string;
  level: ProductionEnvironmentCheckLevel;
  message: string;
}

export interface ProductionEnvironmentValidationReport {
  healthy: boolean;
  tier: "STANDARD" | "PREMIUM" | null;
  checks: ProductionEnvironmentCheck[];
  discoveredEnvironmentReferences: string[];
  unclassifiedEnvironmentReferences: string[];
}

interface ValidateProductionEnvironmentOptions {
  repoRoot?: string;
  discoverSourceReferences?: boolean;
}

const STANDARD_CONCURRENCY_LIMIT =
  2;

const PREMIUM_CONCURRENCY_LIMIT =
  10;

const REQUIRED_BASE_VARIABLES = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "TELEPHONY_PROVIDER",
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "COMMUNICATION_TIER",
  "KNOWLEDGE_STORAGE_DIR",
] as const;

const KNOWN_OPTIONAL_VARIABLES =
  new Set<string>([
    "APP_URL",
    "BASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "LOG_LEVEL",
    "PORT",

    "TWILIO_MEDIA_PORT",
    "WORKER_HEALTH_PORT",
    "SHUTDOWN_TIMEOUT_MS",
    "MEDIA_DRAIN_TIMEOUT_MS",
    "SOCKET_ALLOWED_ORIGINS",

    "CAMPAIGN_CALL_CONCURRENCY",
    "CALL_RETRY_CONCURRENCY",
    "COMMUNICATION_CAMPAIGN_CONCURRENCY",
    "COMMUNICATION_CAMPAIGN_MAKER_CHECKER_ENABLED",
    "BILLING_WEBHOOK_SECRET",

    "DEEPGRAM_AUDIO_BUFFER_MAX_BYTES",

    "GEMINI_TEXT_MODEL",
    "GEMINI_LIVE_MODEL",
    "GEMINI_TTS_MODEL",
    "GEMINI_TTS_VOICE",
    "GEMINI_TTS_STYLE",

    "TWILIO_MESSAGING_SERVICE_SID",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    "TWILIO_PUBLIC_BASE_URL",
    "TWILIO_MEDIA_PUBLIC_URL",
    "EXOTEL_ACCOUNT_SID",
    "EXOTEL_API_KEY",
    "EXOTEL_API_TOKEN",
    "EXOTEL_SUBDOMAIN",
    "EXOTEL_CALLER_ID",
    "EXOTEL_PUBLIC_BASE_URL",
    "EXOTEL_WEBHOOK_SECRET",
    "EXOTEL_MEDIA_PUBLIC_URL",
    "EXOTEL_STREAM_USERNAME",
    "EXOTEL_STREAM_PASSWORD",
    "PLIVO_AUTH_ID",
    "PLIVO_AUTH_TOKEN",
    "PLIVO_CALLER_ID",
    "PLIVO_PUBLIC_BASE_URL",
    "PLIVO_MEDIA_PUBLIC_URL",
    "MESSAGING_BUSINESS_NAME",

    "STALE_CALL_TIMEOUT_MINUTES",
    "STALE_CALL_CHECK_INTERVAL_MS",

    "ENABLE_POST_TURN_ANALYSIS",
    "ENABLE_POST_CALL_ACTIONS",

    "HUMAN_TRANSFER_ENABLED",
    "HUMAN_TRANSFER_TIMEZONE",
    "HUMAN_TRANSFER_START_HOUR",
    "HUMAN_TRANSFER_END_HOUR",
    "HUMAN_TRANSFER_ANNOUNCEMENT",
    "HUMAN_TRANSFER_TIMEOUT_SECONDS",

    "RECORDING_RETENTION_DAYS",
    "TRANSCRIPT_RETENTION_DAYS",
    "CONVERSATION_METADATA_RETENTION_DAYS",
    "AUDIT_EVENT_RETENTION_DAYS",
    "RETENTION_BATCH_SIZE",
    "RETENTION_DELETION_BATCH_SIZE",
    "RETENTION_MAX_RECORDS_PER_RUN",

    "WHATSAPP_ENABLED",

    "META_WA_TEMPLATE_LANGUAGE",
    "META_WHATSAPP_API_VERSION",
    "META_GRAPH_API_VERSION",
  ]);

const PRODUCTION_FORBIDDEN_VARIABLES = [
  "TEST_DESTINATION_NUMBER",
  "TWILIO_TEST_TO_NUMBER",
  "TWILIO_TEST_PUBLIC_URL",
] as const;

const SOURCE_EXTENSIONS =
  new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
  ]);

export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv,
  options: ValidateProductionEnvironmentOptions = {}
): ProductionEnvironmentValidationReport {
  const checks:
    ProductionEnvironmentCheck[] =
      [];

  checkNodeEnvironment(
    env,
    checks
  );

  checkRequiredBaseVariables(
    env,
    checks
  );

  checkDatabaseUrl(
    env,
    checks
  );

  checkRedisUrl(
    env,
    checks
  );

  checkJwtSecret(
    env,
    checks
  );

  checkTelephony(
    env,
    checks
  );

  checkAiProviders(
    env,
    checks
  );

  const tier =
    checkCommunicationPlan(
      env,
      checks
    );

  const whatsappEnabled =
    checkMessaging(
      env,
      checks
    );

  checkHumanTransfer(
    env,
    tier,
    checks
  );

  checkRuntimeTuning(
    env,
    checks
  );

  checkRetentionConfiguration(
    env,
    checks
  );

  checkForbiddenProductionOverrides(
    env,
    checks
  );

  const shouldDiscover =
    options
      .discoverSourceReferences ??
    true;

  const repoRoot =
    resolve(
      options.repoRoot ??
        process.cwd()
    );

  const discoveredEnvironmentReferences =
    shouldDiscover
      ? discoverStaticEnvironmentReferences(
          repoRoot
        )
      : [];

  const unclassifiedEnvironmentReferences =
    checkDiscoveredEnvironmentReferences(
      env,
      tier,
      whatsappEnabled,
      discoveredEnvironmentReferences,
      checks
    );

  return {
    healthy:
      !checks.some(
        check =>
          check.level ===
          "FAIL"
      ),

    tier,

    checks,

    discoveredEnvironmentReferences,

    unclassifiedEnvironmentReferences,
  };
}

export function discoverStaticEnvironmentReferences(
  repoRoot:
    string
): string[] {
  const sourceRoot =
    join(
      repoRoot,
      "src"
    );

  if (
    !existsSync(
      sourceRoot
    )
  ) {
    return [];
  }

  const references =
    new Set<string>();

  for (
    const filePath of
    walkSourceFiles(
      sourceRoot
    )
  ) {
    const source =
      readFileSync(
        filePath,
        "utf8"
      );

    collectMatches(
      source,
      /process\s*\.\s*env\s*\.\s*([A-Z][A-Z0-9_]*)/g,
      references
    );

    collectMatches(
      source,
      /process\s*\.\s*env\s*\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
      references
    );

    collectMatches(
      source,
      /(?:getRequiredEnv|getOptionalEnv|getIntegerEnv|getBooleanEnv|getHttpOriginEnv|getE164PhoneEnv|getRequiredEnvironmentVariable|getRequiredEnvironmentValue|getOptionalEnvironmentValue)\s*\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]/g,
      references
    );
  }

  return [
    ...references,
  ].sort();
}

function checkNodeEnvironment(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const nodeEnv =
    readEnvironmentValue(
      env,
      "NODE_ENV"
    );

  if (
    nodeEnv !==
    "production"
  ) {
    addCheck(
      checks,
      "NODE_ENV",
      "FAIL",
      "must be explicitly set to production for the release gate"
    );

    return;
  }

  addCheck(
    checks,
    "NODE_ENV",
    "PASS",
    "production mode is explicit"
  );
}

function checkRequiredBaseVariables(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  for (
    const name of
    REQUIRED_BASE_VARIABLES
  ) {
    const value =
      readEnvironmentValue(
        env,
        name
      );

    if (
      !value
    ) {
      addCheck(
        checks,
        name,
        "FAIL",
        "required production setting is missing"
      );

      continue;
    }

    if (
      looksLikePlaceholder(
        value
      )
    ) {
      addCheck(
        checks,
        name,
        "FAIL",
        "is still using a placeholder-style value"
      );

      continue;
    }

    addCheck(
      checks,
      name,
      "PASS",
      "configured"
    );
  }
}

function checkDatabaseUrl(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const value =
    readEnvironmentValue(
      env,
      "DATABASE_URL"
    );

  if (
    !value
  ) {
    return;
  }

  const url =
    parseUrl(
      value
    );

  if (
    !url ||
    ![
      "postgres:",
      "postgresql:",
    ].includes(
      url.protocol
    )
  ) {
    addCheck(
      checks,
      "DATABASE_URL",
      "FAIL",
      "must be a PostgreSQL connection URL"
    );

    return;
  }

  if (
    isLocalHostname(
      url.hostname
    )
  ) {
    addCheck(
      checks,
      "DATABASE_URL",
      "FAIL",
      "points to a local host; production must use the deployed database"
    );

    return;
  }

  addCheck(
    checks,
    "DATABASE_URL",
    "PASS",
    "uses a non-local PostgreSQL endpoint"
  );
}

function checkRedisUrl(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const value =
    readEnvironmentValue(
      env,
      "REDIS_URL"
    );

  if (
    !value
  ) {
    return;
  }

  const url =
    parseUrl(
      value
    );

  if (
    !url ||
    ![
      "redis:",
      "rediss:",
    ].includes(
      url.protocol
    )
  ) {
    addCheck(
      checks,
      "REDIS_URL",
      "FAIL",
      "must use redis:// or rediss://"
    );

    return;
  }

  if (
    isLocalHostname(
      url.hostname
    )
  ) {
    addCheck(
      checks,
      "REDIS_URL",
      "FAIL",
      "points to a local host; production must use the deployed Redis service"
    );

    return;
  }

  addCheck(
    checks,
    "REDIS_URL",
    "PASS",
    "uses a non-local Redis endpoint"
  );
}

function checkJwtSecret(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const secret =
    readEnvironmentValue(
      env,
      "JWT_SECRET"
    );

  if (
    !secret
  ) {
    return;
  }

  if (
    secret.length <
    32
  ) {
    addCheck(
      checks,
      "JWT_SECRET",
      "FAIL",
      "must contain at least 32 characters"
    );

    return;
  }

  addCheck(
    checks,
    "JWT_SECRET",
    "PASS",
    "meets the minimum secret-length requirement"
  );
}

function checkTelephony(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const provider =
    readEnvironmentValue(
      env,
      "TELEPHONY_PROVIDER"
    )
      ?.toLowerCase();

  if (provider !== "twilio" && provider !== "exotel" && provider !== "plivo") {
    addCheck(
      checks,
      "TELEPHONY_PROVIDER",
      "FAIL",
      "must be twilio, exotel, or plivo for the production call path"
    );
  } else if (
    provider ===
    "twilio"
  ) {
    addCheck(
      checks,
      "TELEPHONY_PROVIDER",
      "PASS",
      "Twilio production provider selected"
    );
  } else if (provider === "exotel") {
    addCheck(checks, "TELEPHONY_PROVIDER", "PASS", "Exotel production provider selected");
  } else {
    addCheck(checks, "TELEPHONY_PROVIDER", "PASS", "Plivo production provider selected");
  }

  if (provider === "exotel") {
    for (const name of ["EXOTEL_ACCOUNT_SID", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN", "EXOTEL_SUBDOMAIN", "EXOTEL_CALLER_ID", "EXOTEL_PUBLIC_BASE_URL", "EXOTEL_WEBHOOK_SECRET"]) {
      checkRequiredSecret(env, checks, name, "required for Exotel Voice v1 call control");
    }
    const callerId = readEnvironmentValue(env, "EXOTEL_CALLER_ID");
    if (callerId && !isE164(callerId)) addCheck(checks, "EXOTEL_CALLER_ID", "FAIL", "must be an E.164 phone number");
    checkPublicHttpsOrigin(env, "EXOTEL_PUBLIC_BASE_URL", checks);
    checkPublicWssOrigin(env, "EXOTEL_MEDIA_PUBLIC_URL", checks);
    checkRequiredSecret(env, checks, "EXOTEL_STREAM_USERNAME", "required to authenticate Exotel AgentStream connections");
    checkRequiredSecret(env, checks, "EXOTEL_STREAM_PASSWORD", "required to authenticate Exotel AgentStream connections");
    return;
  }

  if (provider === "plivo") {
    for (const name of ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_CALLER_ID", "PLIVO_PUBLIC_BASE_URL", "PLIVO_MEDIA_PUBLIC_URL"]) checkRequiredSecret(env, checks, name, "required for Plivo Voice control and V3 webhook validation");
    const callerId = readEnvironmentValue(env, "PLIVO_CALLER_ID");
    if (callerId && !isE164(callerId)) addCheck(checks, "PLIVO_CALLER_ID", "FAIL", "must be an E.164 phone number");
    checkPublicHttpsOrigin(env, "PLIVO_PUBLIC_BASE_URL", checks);
    checkPublicWssOrigin(env, "PLIVO_MEDIA_PUBLIC_URL", checks);
    return;
  }

  const accountSid =
    readEnvironmentValue(
      env,
      "TWILIO_ACCOUNT_SID"
    );

  if (
    accountSid &&
    !/^AC[a-fA-F0-9]{32}$/.test(
      accountSid
    )
  ) {
    addCheck(
      checks,
      "TWILIO_ACCOUNT_SID",
      "WARN",
      "is configured but does not match the usual Twilio Account SID shape"
    );
  }

  const phoneNumber =
    readEnvironmentValue(
      env,
      "TWILIO_PHONE_NUMBER"
    );

  if (
    phoneNumber &&
    !isE164(
      phoneNumber
    )
  ) {
    addCheck(
      checks,
      "TWILIO_PHONE_NUMBER",
      "FAIL",
      "must be an E.164 phone number"
    );
  }

  checkPublicHttpsOrigin(
    env,
    "TWILIO_PUBLIC_BASE_URL",
    checks
  );

  checkPublicHttpsOrigin(
    env,
    "TWILIO_MEDIA_PUBLIC_URL",
    checks
  );

  const messagingServiceSid =
    readEnvironmentValue(
      env,
      "TWILIO_MESSAGING_SERVICE_SID"
    );

  if (
    !messagingServiceSid
  ) {
    addCheck(
      checks,
      "TWILIO_MESSAGING_SERVICE_SID",
      "WARN",
      "not configured; SMS will rely on the configured Twilio sender path"
    );
  } else if (
    !/^MG[a-fA-F0-9]{32}$/.test(
      messagingServiceSid
    )
  ) {
    addCheck(
      checks,
      "TWILIO_MESSAGING_SERVICE_SID",
      "WARN",
      "is configured but does not match the usual Messaging Service SID shape"
    );
  } else {
    addCheck(
      checks,
      "TWILIO_MESSAGING_SERVICE_SID",
      "PASS",
      "configured"
    );
  }
}

function checkAiProviders(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  for (
    const name of [
      "GEMINI_API_KEY",
      "DEEPGRAM_API_KEY",
    ]
  ) {
    const value =
      readEnvironmentValue(
        env,
        name
      );

    if (
      value &&
      value.length <
        12
    ) {
      addCheck(
        checks,
        name,
        "WARN",
        "is configured but unusually short for a production credential"
      );
    }
  }

  addOptionalDefaultCheck(
    env,
    checks,
    "GEMINI_TEXT_MODEL",
    "application default will be used"
  );

  addOptionalDefaultCheck(
    env,
    checks,
    "GEMINI_LIVE_MODEL",
    "gemini-3.1-flash-live-preview default will be used"
  );

  addOptionalDefaultCheck(
    env,
    checks,
    "GEMINI_TTS_MODEL",
    "application default TTS model will be used"
  );

  addOptionalDefaultCheck(
    env,
    checks,
    "GEMINI_TTS_VOICE",
    "application default TTS voice will be used"
  );

  addOptionalDefaultCheck(
    env,
    checks,
    "GEMINI_TTS_STYLE",
    "application default speaking style will be used"
  );
}

function checkCommunicationPlan(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): "STANDARD" | "PREMIUM" | null {
  const rawTier =
    readEnvironmentValue(
      env,
      "COMMUNICATION_TIER"
    )
      ?.toUpperCase();

  if (
    rawTier !==
      "STANDARD" &&
    rawTier !==
      "PREMIUM"
  ) {
    if (
      rawTier
    ) {
      addCheck(
        checks,
        "COMMUNICATION_TIER",
        "FAIL",
        "must be STANDARD or PREMIUM"
      );
    }

    return null;
  }

  const tier =
    rawTier;

  addCheck(
    checks,
    "COMMUNICATION_TIER",
    "PASS",
    `${tier} plan selected explicitly`
  );

  const configuredConcurrency =
    readEnvironmentValue(
      env,
      "COMMUNICATION_CAMPAIGN_CONCURRENCY"
    );

  const planLimit =
    tier ===
      "PREMIUM"
      ? PREMIUM_CONCURRENCY_LIMIT
      : STANDARD_CONCURRENCY_LIMIT;

  if (
    !configuredConcurrency
  ) {
    addCheck(
      checks,
      "COMMUNICATION_CAMPAIGN_CONCURRENCY",
      "PASS",
      `unset; worker will use the ${tier} plan maximum of ${planLimit}`
    );

    return tier;
  }

  const parsed =
    Number(
      configuredConcurrency
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      1
  ) {
    addCheck(
      checks,
      "COMMUNICATION_CAMPAIGN_CONCURRENCY",
      "FAIL",
      "must be a positive integer"
    );

    return tier;
  }

  if (
    parsed >
    planLimit
  ) {
    addCheck(
      checks,
      "COMMUNICATION_CAMPAIGN_CONCURRENCY",
      "FAIL",
      `exceeds the ${tier} plan maximum of ${planLimit}`
    );

    return tier;
  }

  addCheck(
    checks,
    "COMMUNICATION_CAMPAIGN_CONCURRENCY",
    "PASS",
    `within the ${tier} plan maximum of ${planLimit}`
  );

  return tier;
}

function checkMessaging(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): boolean {
  const rawWhatsappEnabled =
    readEnvironmentValue(
      env,
      "WHATSAPP_ENABLED"
    );

  const whatsappEnabled =
    parseBoolean(
      rawWhatsappEnabled
    );

  if (
    rawWhatsappEnabled &&
    whatsappEnabled ===
      null
  ) {
    addCheck(
      checks,
      "WHATSAPP_ENABLED",
      "FAIL",
      "must be true or false"
    );

    return false;
  }

  if (
    whatsappEnabled !==
    true
  ) {
    addCheck(
      checks,
      "WHATSAPP_ENABLED",
      "PASS",
      "WhatsApp channel disabled; Meta credentials are not required"
    );

    addCheck(
      checks,
      "META_APP_SECRET",
      "PASS",
      "not required while WhatsApp is disabled"
    );

    addCheck(
      checks,
      "META_WHATSAPP_ACCESS_TOKEN",
      "PASS",
      "not required while WhatsApp is disabled"
    );

    addCheck(
      checks,
      "META_WHATSAPP_PHONE_NUMBER_ID",
      "PASS",
      "not required while WhatsApp is disabled"
    );

    addCheck(
      checks,
      "META_WHATSAPP_VERIFY_TOKEN",
      "PASS",
      "not required while WhatsApp is disabled"
    );

    addOptionalDefaultCheck(
      env,
      checks,
      "MESSAGING_BUSINESS_NAME",
      "default business label will be used in transactional messages"
    );

    return false;
  }

  addCheck(
    checks,
    "WHATSAPP_ENABLED",
    "PASS",
    "WhatsApp channel enabled"
  );

  checkRequiredSecret(
    env,
    checks,
    "META_APP_SECRET",
    "required to authenticate Meta WhatsApp webhook signatures"
  );

  checkRequiredSecret(
    env,
    checks,
    "META_WHATSAPP_ACCESS_TOKEN",
    "required when WhatsApp messaging is enabled"
  );

  checkRequiredSecret(
    env,
    checks,
    "META_WHATSAPP_PHONE_NUMBER_ID",
    "required when WhatsApp messaging is enabled"
  );

  checkRequiredSecret(
    env,
    checks,
    "META_WHATSAPP_VERIFY_TOKEN",
    "required for Meta WhatsApp webhook verification"
  );

  addOptionalDefaultCheck(
    env,
    checks,
    "MESSAGING_BUSINESS_NAME",
    "default business label will be used in transactional messages"
  );

  return true;
}

function checkHumanTransfer(
  env: NodeJS.ProcessEnv,
  tier:
    "STANDARD" |
    "PREMIUM" |
    null,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const enabled =
    parseBoolean(
      readEnvironmentValue(
        env,
        "HUMAN_TRANSFER_ENABLED"
      )
    );

  if (
    tier ===
    "PREMIUM"
  ) {
    if (
      enabled !==
      true
    ) {
      addCheck(
        checks,
        "HUMAN_TRANSFER_ENABLED",
        "FAIL",
        "must be true for the Premium production feature contract"
      );
    } else {
      addCheck(
        checks,
        "HUMAN_TRANSFER_ENABLED",
        "PASS",
        "Premium human transfer enabled"
      );
    }

  } else if (
    tier ===
      "STANDARD" &&
    enabled ===
      true
  ) {
    addCheck(
      checks,
      "HUMAN_TRANSFER_ENABLED",
      "WARN",
      "enabled in configuration but Standard server entitlements will still block this Premium feature"
    );
  } else {
    addCheck(
      checks,
      "HUMAN_TRANSFER_ENABLED",
      "PASS",
      "not required for the Standard plan"
    );
  }

  checkOptionalHour(
    env,
    checks,
    "HUMAN_TRANSFER_START_HOUR"
  );

  checkOptionalHour(
    env,
    checks,
    "HUMAN_TRANSFER_END_HOUR"
  );

  checkOptionalPositiveInteger(
    env,
    checks,
    "HUMAN_TRANSFER_TIMEOUT_SECONDS"
  );
}

function checkRuntimeTuning(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  checkOptionalPort(
    env,
    checks,
    "PORT"
  );

  checkOptionalPort(
    env,
    checks,
    "TWILIO_MEDIA_PORT"
  );

  checkOptionalPort(
    env,
    checks,
    "WORKER_HEALTH_PORT"
  );

  for (
    const name of [
      "SHUTDOWN_TIMEOUT_MS",
      "CAMPAIGN_CALL_CONCURRENCY",
      "CALL_RETRY_CONCURRENCY",
      "DEEPGRAM_AUDIO_BUFFER_MAX_BYTES",
      "STALE_CALL_TIMEOUT_MINUTES",
      "STALE_CALL_CHECK_INTERVAL_MS",
    ]
  ) {
    checkOptionalPositiveInteger(
      env,
      checks,
      name
    );
  }

  for (
    const name of [
      "ENABLE_POST_TURN_ANALYSIS",
      "ENABLE_POST_CALL_ACTIONS",
    ]
  ) {
    checkOptionalBoolean(
      env,
      checks,
      name
    );
  }

  const knowledgeStorage = readEnvironmentValue(env, "KNOWLEDGE_STORAGE_DIR");
  if (knowledgeStorage) {
    const publicRoot = resolve(process.cwd(), "public");
    const storageRoot = resolve(knowledgeStorage);
    const isPublic = storageRoot === publicRoot || storageRoot.startsWith(`${publicRoot}/`) || storageRoot.startsWith(`${publicRoot}\\`);
    addCheck(checks, "KNOWLEDGE_STORAGE_DIR", isPublic ? "FAIL" : "PASS", isPublic ? "must not be located under public/" : "uses a private storage directory");
  }

  const logLevel =
    readEnvironmentValue(
      env,
      "LOG_LEVEL"
    );

  if (
    logLevel &&
    ![
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent",
    ].includes(
      logLevel.toLowerCase()
    )
  ) {
    addCheck(
      checks,
      "LOG_LEVEL",
      "WARN",
      "uses an unrecognized logging level"
    );
  } else {
    addOptionalDefaultCheck(
      env,
      checks,
      "LOG_LEVEL",
      "application default logging level will be used"
    );
  }

  const allowedOrigins =
    readEnvironmentValue(
      env,
      "SOCKET_ALLOWED_ORIGINS"
    );

  if (
    !allowedOrigins
  ) {
    addCheck(
      checks,
      "SOCKET_ALLOWED_ORIGINS",
      "WARN",
      "not explicitly configured; verify dashboard Socket.IO origin policy before deployment"
    );
  } else if (
    allowedOrigins
      .toLowerCase()
      .includes(
        "localhost"
      ) ||
    allowedOrigins
      .includes(
        "127.0.0.1"
      )
  ) {
    addCheck(
      checks,
      "SOCKET_ALLOWED_ORIGINS",
      "WARN",
      "contains a local development origin"
    );
  } else {
    addCheck(
      checks,
      "SOCKET_ALLOWED_ORIGINS",
      "PASS",
      "configured without a local development origin"
    );
  }
}

function checkRetentionConfiguration(
  env: NodeJS.ProcessEnv,
  checks: ProductionEnvironmentCheck[]
): void {
  const batchSize = checkOptionalBoundedPositiveInteger(
    env,
    checks,
    "RETENTION_BATCH_SIZE",
    1_000
  );
  const maxPerRun = checkOptionalBoundedPositiveInteger(
    env,
    checks,
    "RETENTION_MAX_RECORDS_PER_RUN",
    100_000
  );

  if (
    batchSize !== null &&
    maxPerRun !== null &&
    batchSize > maxPerRun
  ) {
    addCheck(
      checks,
      "RETENTION_BATCH_SIZE",
      "FAIL",
      "must be less than or equal to RETENTION_MAX_RECORDS_PER_RUN"
    );
  }
}

function checkOptionalBoundedPositiveInteger(
  env: NodeJS.ProcessEnv,
  checks: ProductionEnvironmentCheck[],
  name: string,
  maximum: number
): number | null {
  const value = readEnvironmentValue(env, name);

  if (!value) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    addCheck(checks, name, "FAIL", "must be a positive integer");
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    addCheck(checks, name, "FAIL", `must be less than or equal to ${maximum}`);
    return null;
  }

  addCheck(checks, name, "PASS", "valid bounded positive integer configuration");
  return parsed;
}

function checkForbiddenProductionOverrides(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[]
): void {
  for (
    const name of
    PRODUCTION_FORBIDDEN_VARIABLES
  ) {
    if (
      readEnvironmentValue(
        env,
        name
      )
    ) {
      addCheck(
        checks,
        name,
        "FAIL",
        "development/test destination override must not be configured in production"
      );
    } else {
      addCheck(
        checks,
        name,
        "PASS",
        "not configured in production"
      );
    }
  }
}

function checkDiscoveredEnvironmentReferences(
  env: NodeJS.ProcessEnv,
  tier:
    "STANDARD" |
    "PREMIUM" |
    null,
  whatsappEnabled:
    boolean,
  discovered:
    string[],
  checks:
    ProductionEnvironmentCheck[]
): string[] {
  const classified =
    new Set<string>([
      ...REQUIRED_BASE_VARIABLES,
      ...KNOWN_OPTIONAL_VARIABLES,
      ...PRODUCTION_FORBIDDEN_VARIABLES,

      "NODE_ENV",

      "WHATSAPP_ENABLED",

      "META_APP_SECRET",
      "META_WHATSAPP_ACCESS_TOKEN",
      "META_WHATSAPP_PHONE_NUMBER_ID",
      "META_WHATSAPP_VERIFY_TOKEN",
    ]);

  const unclassified:
    string[] =
      [];

  for (
    const name of
    discovered
  ) {
    if (
      classified.has(
        name
      )
    ) {
      continue;
    }

    if (
      name.startsWith(
        "META_WA_TEMPLATE_"
      )
    ) {
      if (
        whatsappEnabled
      ) {
        addOptionalDefaultCheck(
          env,
          checks,
          name,
          "application/template default will be used"
        );
      }

      continue;
    }

    if (
      name.startsWith(
        "META_"
      )
    ) {
      if (
        !whatsappEnabled
      ) {
        continue;
      }

      const value =
        readEnvironmentValue(
          env,
          name
        );

      if (
        name.includes(
          "VERSION"
        )
      ) {
        addOptionalDefaultCheck(
          env,
          checks,
          name,
          "provider default API version will be used"
        );

        continue;
      }

      if (
        !value
      ) {
        addCheck(
          checks,
          name,
          "FAIL",
          "Meta provider setting is referenced by the current source but is not configured"
        );
      } else {
        addCheck(
          checks,
          name,
          "PASS",
          "Meta provider setting is configured"
        );
      }

      continue;
    }

    if (
      name.startsWith(
        "HUMAN_TRANSFER_"
      )
    ) {
      if (
        tier ===
          "PREMIUM" &&
        !readEnvironmentValue(
          env,
          name
        )
      ) {
        addCheck(
          checks,
          name,
          "WARN",
          "Premium human-transfer setting is referenced but not explicitly configured"
        );
      }

      continue;
    }

    unclassified.push(
      name
    );

    addCheck(
      checks,
      name,
      "WARN",
      readEnvironmentValue(
        env,
        name
      )
        ? "referenced by source and configured, but not yet classified by the production validator"
        : "referenced by source but not configured; review whether it is optional before release"
    );
  }

  return unclassified;
}

function checkRequiredSecret(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string,
  missingMessage:
    string
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      missingMessage
    );

    return;
  }

  if (
    looksLikePlaceholder(
      value
    )
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "is still using a placeholder-style value"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "configured"
  );
}

function checkPublicHttpsOrigin(
  env: NodeJS.ProcessEnv,
  name:
    string,
  checks:
    ProductionEnvironmentCheck[]
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    return;
  }

  const url =
    parseUrl(
      value
    );

  if (
    !url
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be a valid absolute URL"
    );

    return;
  }

  if (
    url.protocol !==
    "https:"
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must use HTTPS in production"
    );

    return;
  }

  if (
    isLocalHostname(
      url.hostname
    )
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must use a publicly reachable production hostname"
    );

    return;
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be a clean public origin without credentials, query parameters, or fragments"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "uses a public HTTPS origin"
  );
}

function checkPublicWssOrigin(
  env: NodeJS.ProcessEnv,
  name: string,
  checks: ProductionEnvironmentCheck[]
): void {
  const value = readEnvironmentValue(env, name);
  if (!value) return;
  const url = parseUrl(value);
  if (!url) {
    addCheck(checks, name, "FAIL", "must be a valid absolute URL");
    return;
  }
  if (url.protocol !== "wss:") {
    addCheck(checks, name, "FAIL", "must use WSS in production");
    return;
  }
  if (isLocalHostname(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    addCheck(checks, name, "FAIL", "must be a clean publicly reachable WSS origin");
    return;
  }
  addCheck(checks, name, "PASS", "uses a secure public WebSocket origin");
}

function checkOptionalPort(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    return;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      1 ||
    parsed >
      65_535
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be an integer between 1 and 65535"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "valid port configuration"
  );
}

function checkOptionalPositiveInteger(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    return;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      1
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be a positive integer"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "valid positive integer configuration"
  );
}

function checkOptionalHour(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    return;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      0 ||
    parsed >
      23
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be an integer hour between 0 and 23"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "valid hour configuration"
  );
}

function checkOptionalBoolean(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string
): void {
  const value =
    readEnvironmentValue(
      env,
      name
    );

  if (
    !value
  ) {
    return;
  }

  if (
    parseBoolean(
      value
    ) ===
    null
  ) {
    addCheck(
      checks,
      name,
      "FAIL",
      "must be true or false"
    );

    return;
  }

  addCheck(
    checks,
    name,
    "PASS",
    "valid boolean configuration"
  );
}

function addOptionalDefaultCheck(
  env: NodeJS.ProcessEnv,
  checks:
    ProductionEnvironmentCheck[],
  name:
    string,
  defaultMessage:
    string
): void {
  if (
    readEnvironmentValue(
      env,
      name
    )
  ) {
    addCheck(
      checks,
      name,
      "PASS",
      "configured override"
    );
  } else {
    addCheck(
      checks,
      name,
      "PASS",
      defaultMessage
    );
  }
}

function readEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name:
    string
): string | undefined {
  const value =
    env[name]
      ?.trim();

  return value ||
    undefined;
}

function looksLikePlaceholder(
  value:
    string
): boolean {
  const normalized =
    value
      .trim()
      .toLowerCase();

  return [
    "replace_",
    "replace-with",
    "change_me",
    "changeme",
    "your_",
    "your-",
    "example",
    "placeholder",
    "dummy",
    "todo",
    "reacted",
    "redacted",
  ].some(
    marker =>
      normalized.includes(
        marker
      )
  );
}

function isE164(
  value:
    string
): boolean {
  return /^\+[1-9]\d{7,14}$/.test(
    value
  );
}

function parseBoolean(
  value:
    string |
    undefined
): boolean | null {
  if (
    value ===
    undefined
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(
      normalized
    )
  ) {
    return false;
  }

  return null;
}

function parseUrl(
  value:
    string
): URL | null {
  try {
    return new URL(
      value
    );
  } catch {
    return null;
  }
}

function isLocalHostname(
  hostname:
    string
): boolean {
  const normalized =
    hostname
      .trim()
      .toLowerCase();

  return (
    normalized ===
      "localhost" ||
    normalized ===
      "127.0.0.1" ||
    normalized ===
      "::1" ||
    normalized.endsWith(
      ".localhost"
    )
  );
}

function addCheck(
  checks:
    ProductionEnvironmentCheck[],
  name:
    string,
  level:
    ProductionEnvironmentCheckLevel,
  message:
    string
): void {
  const existingIndex =
    checks.findIndex(
      check =>
        check.name ===
          name
    );

  if (
    existingIndex <
    0
  ) {
    checks.push({
      name,
      level,
      message,
    });

    return;
  }

  const priority:
    Record<
      ProductionEnvironmentCheckLevel,
      number
    > = {
      PASS:
        0,
      WARN:
        1,
      FAIL:
        2,
    };

  const existing =
    checks[
      existingIndex
    ];

  if (
    priority[level] >
    priority[
      existing.level
    ]
  ) {
    checks[
      existingIndex
    ] = {
      name,
      level,
      message,
    };
  }
}

function collectMatches(
  source:
    string,
  pattern:
    RegExp,
  references:
    Set<string>
): void {
  let match:
    RegExpExecArray |
    null;

  while (
    (
      match =
        pattern.exec(
          source
        )
    ) !==
    null
  ) {
    const name =
      match[1];

    if (
      name
    ) {
      references.add(
        name
      );
    }
  }
}

function walkSourceFiles(
  directory:
    string
): string[] {
  const files:
    string[] =
      [];

  for (
    const entry of
    readdirSync(
      directory
    )
  ) {
    const path =
      join(
        directory,
        entry
      );

    const stat =
      statSync(
        path
      );

    if (
      stat.isDirectory()
    ) {
      files.push(
        ...walkSourceFiles(
          path
        )
      );

      continue;
    }

    const extension =
      entry.slice(
        entry.lastIndexOf(
          "."
        )
      );

    if (
      SOURCE_EXTENSIONS.has(
        extension
      )
    ) {
      files.push(
        path
      );
    }
  }

  return files;
}
