import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimitResponse,
  ensureRateLimit,
  readClientAddress,
  withIdempotentResponse,
} from "@/lib/abuse-control";

import { startCall } from "@/services/telephony/telephony.service";
import type { CallRequest } from "@/services/telephony/types";

function normalizeScalar(
  value: unknown
): string | number | boolean | null {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function buildStartCallFingerprint(
  clientAddress: string,
  body: Record<string, unknown>
): string {
  return JSON.stringify({
    clientAddress,

    idempotencyKey:
      normalizeScalar(
        body.idempotencyKey
      ),

    campaignId:
      normalizeScalar(
        body.campaignId
      ),

    campaignRunId:
      normalizeScalar(
        body.campaignRunId
      ),

    contactId:
      normalizeScalar(
        body.contactId
      ),

    to: normalizeScalar(
      body.to
    ),

    providerDestination:
      normalizeScalar(
        body.providerDestination
      ),

    contactPhone:
      normalizeScalar(
        body.contactPhone
      ),

    attemptNumber:
      normalizeScalar(
        body.attemptNumber
      ),

    maxAttempts:
      normalizeScalar(
        body.maxAttempts
      ),

    language:
      normalizeScalar(
        body.language
      ),

    usedDevelopmentOverride:
      normalizeScalar(
        body.usedDevelopmentOverride
      ),

    destinationOverrideSource:
      normalizeScalar(
        body.destinationOverrideSource
      ),

    from: normalizeScalar(
      body.from
    ),
  });
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const clientAddress =
      readClientAddress(
        request
      );

    const idempotencyResult =
      await withIdempotentResponse<unknown>({
        scope:
          "outbound-call-start",

        keyParts: [
          buildStartCallFingerprint(
            clientAddress,
            body
          ),
        ],

        ttlMs:
          24 *
          60 *
          60 *
          1000,

        operation:
          async () => {
            await ensureRateLimit({
              scope:
                "outbound-call-start",

              limit:
                12,

              windowMs:
                60 *
                1000,

            keyParts: [
              clientAddress,

                normalizeScalar(
                  body.campaignId
                ),

                normalizeScalar(
                  body.contactId
                ),

                normalizeScalar(
                  body.to ??
                    body.providerDestination
                ),

                normalizeScalar(
                  body.contactPhone
                ),

                normalizeScalar(
                  body.attemptNumber
                ),
              ],
            });

            const result =
              await startCall(
                body as unknown as CallRequest
              );

            return {
              status:
                200,

              body:
                result,
            };
          },
      });

    if (
      idempotencyResult.response
    ) {
      return NextResponse.json(
        idempotencyResult.response.body,
        {
          status:
            idempotencyResult.response.status,
        }
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Duplicate call start request in progress",
      },
      {
        status:
          409,
      }
    );
  } catch (error) {
    const rateLimitResponse =
      createRateLimitResponse(
        error
      );

    if (
      rateLimitResponse
    ) {
      return rateLimitResponse;
    }

    console.error("Start Call Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to start call",
      },
      {
        status: 500,
      }
    );
  }
}
