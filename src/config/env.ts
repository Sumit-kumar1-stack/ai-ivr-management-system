type EnvironmentName =
  | "development"
  | "test"
  | "production";

export interface TwilioEnvironment {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  publicBaseUrl: string;
  mediaPublicUrl: string;
}

export interface PlivoEnvironment {
  authId: string;
  authToken: string;
  callerId: string;
  publicBaseUrl: string;
  mediaPublicUrl: string;
}

export interface AIEnvironment {
  geminiApiKey: string;
  deepgramApiKey: string;
}

export interface RedisEnvironment {
  redisUrl: string;
}

export interface ApplicationEnvironment {
  nodeEnv: EnvironmentName;
  jwtSecret: string;
}

export function getRequiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from the environment`
    );
  }

  return value;
}

export function getOptionalEnv(
  name: string
): string | undefined {
  const value =
    process.env[name]?.trim();

  return value || undefined;
}

export function getIntegerEnv(
  name: string,
  fallback: number,
  minimum = 0
): number {
  const value =
    getOptionalEnv(name);

  if (!value) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum
  ) {
    throw new Error(
      `${name} must be an integer greater than or equal to ${minimum}`
    );
  }

  return parsed;
}

export function getBooleanEnv(
  name: string,
  fallback = false
): boolean {
  const value =
    getOptionalEnv(name);

  if (!value) {
    return fallback;
  }

  const normalized =
    value.toLowerCase();

  if (
    normalized === "true" ||
    normalized === "1"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0"
  ) {
    return false;
  }

  throw new Error(
    `${name} must be true, false, 1, or 0`
  );
}

export function getHttpOriginEnv(
  name: string
): string {
  const value =
    getRequiredEnv(name);

  let url: URL;

  try {
    url =
      new URL(value);
  } catch {
    throw new Error(
      `${name} must be a valid URL`
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      `${name} must use HTTP or HTTPS`
    );
  }

  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must contain only the public origin without a path, query, or fragment`
    );
  }

  return url.origin;
}

export function getE164PhoneEnv(
  name: string
): string {
  const value =
    getRequiredEnv(name);

  if (
    !/^\+[1-9]\d{7,14}$/.test(
      value
    )
  ) {
    throw new Error(
      `${name} must be a valid E.164 phone number`
    );
  }

  return value;
}

export function getNodeEnvironment(): EnvironmentName {
  const value =
    process.env.NODE_ENV;

  if (
    value === "production" ||
    value === "test"
  ) {
    return value;
  }

  return "development";
}

export function getTwilioEnvironment(): TwilioEnvironment {
  return {
    accountSid:
      getRequiredEnv(
        "TWILIO_ACCOUNT_SID"
      ),

    authToken:
      getRequiredEnv(
        "TWILIO_AUTH_TOKEN"
      ),

    phoneNumber:
      getE164PhoneEnv(
        "TWILIO_PHONE_NUMBER"
      ),

    publicBaseUrl:
      getHttpOriginEnv(
        "TWILIO_PUBLIC_BASE_URL"
      ),

    mediaPublicUrl:
      getHttpOriginEnv(
        "TWILIO_MEDIA_PUBLIC_URL"
      ),
  };
}

/** Plivo V3 webhook signatures use the account Auth Token. */
export function getPlivoEnvironment(): PlivoEnvironment {
  return {
    authId: getRequiredEnv("PLIVO_AUTH_ID"),
    authToken: getRequiredEnv("PLIVO_AUTH_TOKEN"),
    callerId: getE164PhoneEnv("PLIVO_CALLER_ID"),
    publicBaseUrl: getHttpOriginEnv("PLIVO_PUBLIC_BASE_URL"),
    mediaPublicUrl: getOptionalWsOrigin("PLIVO_MEDIA_PUBLIC_URL") ?? "",
  };
}

export function getAIEnvironment(): AIEnvironment {
  return {
    geminiApiKey:
      getRequiredEnv(
        "GEMINI_API_KEY"
      ),

    deepgramApiKey:
      getRequiredEnv(
        "DEEPGRAM_API_KEY"
      ),
  };
}

export function getRedisEnvironment(): RedisEnvironment {
  return {
    redisUrl:
      getRequiredEnv(
        "REDIS_URL"
      ),
  };
}

export function getApplicationEnvironment(): ApplicationEnvironment {
  const jwtSecret =
    getRequiredEnv(
      "JWT_SECRET"
    );

  if (
    jwtSecret.length < 32
  ) {
    throw new Error(
      "JWT_SECRET must contain at least 32 characters"
    );
  }

  return {
    nodeEnv:
      getNodeEnvironment(),

    jwtSecret,
  };
}

export function getExotelEnvironment(): ExotelEnvironment {
  const subdomain = getRequiredEnv("EXOTEL_SUBDOMAIN")
    .replace(/^https:\/\//, "")
    .replace(/\/+$/, "");

  if (!/^[a-z0-9.-]+$/i.test(subdomain)) {
    throw new Error("EXOTEL_SUBDOMAIN must be an Exotel API hostname without a protocol");
  }

  return {
    accountSid: getRequiredEnv("EXOTEL_ACCOUNT_SID"),
    apiKey: getRequiredEnv("EXOTEL_API_KEY"),
    apiToken: getRequiredEnv("EXOTEL_API_TOKEN"),
    subdomain,
    callerId: getE164PhoneEnv("EXOTEL_CALLER_ID"),
    publicBaseUrl: getHttpOriginEnv("EXOTEL_PUBLIC_BASE_URL"),
    // Voice v1 has no documented signed-webhook verifier. A deployment-owned
    // secret is therefore mandatory for this public callback boundary.
    webhookSecret: getRequiredEnv("EXOTEL_WEBHOOK_SECRET"),
    mediaPublicUrl: getOptionalWsOrigin("EXOTEL_MEDIA_PUBLIC_URL"),
    streamUsername: getOptionalEnv("EXOTEL_STREAM_USERNAME"),
    streamPassword: getOptionalEnv("EXOTEL_STREAM_PASSWORD"),
  };
}

export function getOptionalWsOrigin(name: string): string | undefined {
  const value = getOptionalEnv(name);
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error(`${name} must use WS or WSS`);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(`${name} must contain only a public origin`);
  return url.origin;
}

export interface ExotelEnvironment {
  accountSid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  callerId: string;
  publicBaseUrl: string;
  webhookSecret: string;
  mediaPublicUrl?: string;
  streamUsername?: string;
  streamPassword?: string;
}
