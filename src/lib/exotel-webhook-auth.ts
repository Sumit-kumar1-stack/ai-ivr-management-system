import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getExotelEnvironment } from "@/config/env";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "exotel-webhook-auth" });

export class ExotelWebhookAuthenticationError extends Error {
  constructor(message = "Invalid Exotel webhook authentication") {
    super(message);
    this.name = "ExotelWebhookAuthenticationError";
  }
}

export async function validateExotelWebhook(request: NextRequest): Promise<Record<string, string>> {
  const expected = getExotelEnvironment().webhookSecret;
  const supplied = request.headers.get("x-exotel-webhook-secret")?.trim() || request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!safeEqual(expected, supplied)) {
    log.warn({ event: "exotel.webhook.authentication_rejected", pathname: request.nextUrl.pathname, secretPresent: Boolean(supplied) }, "Exotel webhook authentication rejected");
    throw new ExotelWebhookAuthenticationError();
  }

  const params: Record<string, string> = {};
  if (request.method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => { params[key] = value; });
    return params;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await request.json() as Record<string, unknown>;
    for (const [key, value] of Object.entries(payload)) if (typeof value === "string" || typeof value === "number") params[key] = String(value);
  } else {
    const form = await request.formData();
    form.forEach((value, key) => { if (typeof value === "string") params[key] = value; });
  }
  return params;
}

export function createExotelAuthErrorResponse(error: unknown): NextResponse | null {
  return error instanceof ExotelWebhookAuthenticationError
    ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
    : null;
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
