import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { AppError } from "@/lib/app-error";

import { redisConnection } from "@/lib/redis";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log = createServerLogger("abuse-control");

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface RateLimitInput {
  scope: string;
  limit: number;
  windowMs: number;
  keyParts: Array<
    string | number | boolean | null | undefined
  >;
  failurePolicy?: "FAIL_OPEN" | "FAIL_CLOSED";
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  windowMs: number;
  retryAfterMs: number;
  key: string;
}

export class RateLimitExceededError extends AppError {
  readonly code = "RATE_LIMITED" as const;

  readonly current: number;

  readonly limit: number;

  readonly retryAfterMs: number;

  readonly key: string;

  constructor(
    input: RateLimitResult
  ) {
    super(
      "Too many requests",
      429,
      "RATE_LIMITED",
      {
        current:
          input.current,

        limit:
          input.limit,

        retryAfterMs:
          input.retryAfterMs,
      }
    );

    this.current = input.current;
    this.limit = input.limit;
    this.retryAfterMs = input.retryAfterMs;
    this.key = input.key;
  }
}

export class RateLimitUnavailableError extends AppError {
  readonly code = "RATE_LIMIT_UNAVAILABLE" as const;

  constructor() {
    super("Request protection is temporarily unavailable", 503, "RATE_LIMIT_UNAVAILABLE");
  }
}

export interface IdempotentResponse<T> {
  status: number;
  body: T;
}

export interface IdempotentRequestInput<T> {
  scope: string;
  keyParts: Array<
    string | number | boolean | null | undefined
  >;
  ttlMs: number;
  operation: () => Promise<IdempotentResponse<T>>;
}

export interface IdempotentRequestResult<T> {
  duplicate: boolean;
  cached: boolean;
  response: IdempotentResponse<T> | null;
}

//--------------------------------------------------
// Client Identity
//--------------------------------------------------

export function readClientAddress(
  request: {
    headers: Headers;
  }
): string {
  const forwardedFor =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();

  const realIp =
    request.headers
      .get("x-real-ip")
      ?.trim();

  const connectingIp =
    request.headers
      .get("cf-connecting-ip")
      ?.trim();

  return (
    forwardedFor ||
    realIp ||
    connectingIp ||
    "unknown"
  );
}

//--------------------------------------------------
// Key Helpers
//--------------------------------------------------

function normalizeKeyPart(
  value:
    string |
    number |
    boolean |
    null |
    undefined
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  return String(value);
}

export function buildAbuseKey(
  scope: string,
  keyParts: Array<
    string | number | boolean | null | undefined
  >
): string {
  const normalizedScope =
    scope.trim().toLowerCase();

  const payload =
    keyParts
      .map(normalizeKeyPart)
      .join("|");

  const digest =
    createHash("sha256")
      .update(payload)
      .digest("hex");

  return [
    "abuse",
    normalizedScope,
    digest,
  ].join(":");
}

//--------------------------------------------------
// Rate Limit
//--------------------------------------------------

export async function enforceRateLimit(
  input: RateLimitInput
): Promise<RateLimitResult> {
  const limit =
    Math.max(
      1,
      Math.floor(
        input.limit
      )
    );

  const windowMs =
    Math.max(
      1,
      Math.floor(
        input.windowMs
      )
    );

  const key =
    buildAbuseKey(
      input.scope,
      input.keyParts
    );
  const failurePolicy = input.failurePolicy ?? "FAIL_OPEN";

  try {
    const raw =
      await redisConnection.eval(
        `
          local current = redis.call("INCR", KEYS[1])
          if current == 1 then
            redis.call("PEXPIRE", KEYS[1], ARGV[1])
          end

          local ttl = redis.call("PTTL", KEYS[1])
          return { current, ttl }
        `,
        1,
        key,
        String(
          windowMs
        )
      ) as [number, number];

    const current =
      Number(
        raw?.[0] ?? 0
      );

    const retryAfterMs =
      Number(
        raw?.[1] ?? windowMs
      );

    return {
      allowed:
        current <= limit,

      current,

      limit,

      windowMs,

      retryAfterMs:
        Number.isFinite(
          retryAfterMs
        ) &&
        retryAfterMs > 0
          ? retryAfterMs
          : windowMs,

      key,
    };
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "abuse.rate_limit.degraded",

        scope:
          input.scope,

        error:
          normalizeError(
            error
          ),
      },
      failurePolicy === "FAIL_CLOSED"
        ? "Rate limit check failed; rejecting protected request"
        : "Rate limit check failed; allowing request in degraded mode"
    );

    return {
      allowed: failurePolicy !== "FAIL_CLOSED",

      current:
        0,

      limit,

      windowMs,

      retryAfterMs:
        windowMs,

      key,
    };
  }
}

export async function ensureRateLimit(
  input: RateLimitInput
): Promise<RateLimitResult> {
  const result =
    await enforceRateLimit(
      input
    );

  if (
    !result.allowed
  ) {
    if (input.failurePolicy === "FAIL_CLOSED" && result.current === 0) {
      throw new RateLimitUnavailableError();
    }
    throw new RateLimitExceededError(
      result
    );
  }

  return result;
}

export function isRateLimitExceededError(
  error: unknown
): error is RateLimitExceededError {
  return (
    error instanceof
      RateLimitExceededError
  );
}

export function createRateLimitResponse(
  error: unknown
): NextResponse | null {
  if (error instanceof RateLimitUnavailableError) {
    return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.statusCode, headers: { "Retry-After": "1" } });
  }

  if (!isRateLimitExceededError(error)) {
    return null;
  }

  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        error.retryAfterMs /
          1000
      )
    );

  return NextResponse.json(
    {
      success:
        false,

      code:
        error.code,

      message:
        error.message,

      retryAfterMs:
        error.retryAfterMs,

      limit: {
        limit:
          error.limit,

        current:
          error.current,
      },
    },
    {
      status:
        error.statusCode,

      headers: {
        "Retry-After":
          String(
            retryAfterSeconds
          ),
      },
    }
  );
}

//--------------------------------------------------
// Idempotent Requests
//--------------------------------------------------

const IDEMPOTENCY_PENDING_VALUE =
  "__PENDING__";

interface StoredIdempotentResponse<T> {
  state:
    "DONE";

  response:
    IdempotentResponse<T>;
}

function tryParseStoredResponse<T>(
  raw: string | null
): IdempotentResponse<T> | null {
  if (
    !raw ||
    raw ===
      IDEMPOTENCY_PENDING_VALUE
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        raw
      ) as StoredIdempotentResponse<T>;

    if (
      parsed &&
      parsed.state ===
        "DONE" &&
      parsed.response &&
      typeof parsed.response.status ===
        "number"
    ) {
      return parsed.response;
    }
  } catch {
    return null;
  }

  return null;
}

export async function withIdempotentResponse<T>(
  input: IdempotentRequestInput<T>
): Promise<IdempotentRequestResult<T>> {
  const key =
    buildAbuseKey(
      `idempotency:${input.scope}`,
      input.keyParts
    );

  const cachedRaw =
    await redisConnection.get(
      key
    );

  const cachedResponse =
    tryParseStoredResponse<T>(
      cachedRaw
    );

  if (
    cachedResponse
  ) {
    return {
      duplicate:
        true,

      cached:
        true,

      response:
        cachedResponse,
    };
  }

  const reserved =
    await redisConnection.set(
      key,
      IDEMPOTENCY_PENDING_VALUE,
      "PX",
      input.ttlMs,
      "NX"
    );

  if (
    reserved !==
    "OK"
  ) {
    const existing =
      tryParseStoredResponse<T>(
        await redisConnection.get(
          key
        )
      );

    return {
      duplicate:
        true,

      cached:
        Boolean(
          existing
        ),

      response:
        existing,
    };
  }

  try {
    const response =
      await input.operation();

    await redisConnection.set(
      key,
      JSON.stringify(
        {
          state:
            "DONE",

          response,
        }
      ),
      "PX",
      input.ttlMs
    );

    return {
      duplicate:
        false,

      cached:
        false,

      response,
    };
  } catch (
    error
  ) {
    await redisConnection.del(
      key
    );

    throw error;
  }
}

export function buildRequestFingerprintKey(
  scope: string,
  values: Record<
    string,
    unknown
  >
): string {
  const normalized =
    Object.entries(
      values
    )
      .sort(
        (
          [left],
          [right]
        ) =>
          left.localeCompare(
            right
          )
      )
      .map(
        ([key, value]) =>
          `${key}=${normalizeFingerprintValue(
            value
          )}`
      )
      .join("&");

  return buildAbuseKey(
    scope,
    [
      normalized,
    ]
  );
}

function normalizeFingerprintValue(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(
      value
    );
  }

  return JSON.stringify(
    value
  );
}
