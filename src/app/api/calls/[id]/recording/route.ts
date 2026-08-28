import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  requireRole,
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/auth";

import {
  createCallLogger,
  createLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  assertCallOwnership,
} from "@/services/security/tenant-access.service";
import { PlivoProvider } from "@/providers/telephony/plivo.provider";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

//--------------------------------------------------
// Route Context
//--------------------------------------------------

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

//--------------------------------------------------
// Allowed Roles
//--------------------------------------------------

const RECORDING_ROLES:
  readonly UserRole[] = [
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ];

//--------------------------------------------------
// Route Logger
//--------------------------------------------------

const routeLog =
  createLogger({
    component:
      "call-recording-proxy",
  });

//--------------------------------------------------
// Allowed Twilio Hosts
//--------------------------------------------------

const ALLOWED_TWILIO_HOSTS =
  new Set([
    "api.twilio.com",
    "media.twiliocdn.com",
  ]);

const EXOTEL_RECORDING_HOST =
  "s3-ap-southeast-1.amazonaws.com";

//--------------------------------------------------
// Basic Authentication Header
//--------------------------------------------------

function buildBasicAuthHeader(
  accountSid: string,
  authToken: string
): string {
  const credentials =
    Buffer.from(
      `${accountSid}:${authToken}`,
      "utf8"
    ).toString(
      "base64"
    );

  return `Basic ${credentials}`;
}

//--------------------------------------------------
// Safe Twilio Media URL
//--------------------------------------------------

function buildTwilioMediaUrl(
  recordingUrl: string,
  accountSid: string
): URL {
  let parsedUrl:
    URL;

  try {
    parsedUrl =
      new URL(
        recordingUrl
      );
  } catch {
    throw new Error(
      "Stored recording URL is invalid"
    );
  }

  if (
    parsedUrl.protocol !==
    "https:"
  ) {
    throw new Error(
      "Recording URL must use HTTPS"
    );
  }

  const hostname =
    parsedUrl.hostname
      .toLowerCase();

  if (
    !ALLOWED_TWILIO_HOSTS.has(
      hostname
    )
  ) {
    throw new Error(
      "Recording URL host is not allowed"
    );
  }

  if (
    hostname ===
      "api.twilio.com" &&
    !parsedUrl.pathname.includes(
      `/Accounts/${accountSid}/`
    )
  ) {
    throw new Error(
      "Recording does not belong to the configured Twilio account"
    );
  }

  parsedUrl.pathname =
    parsedUrl.pathname.replace(
      /\.(mp3|wav)$/i,
      ""
    );

  parsedUrl.pathname =
    `${parsedUrl.pathname}.mp3`;

  parsedUrl.search =
    "";

  parsedUrl.hash =
    "";

  return parsedUrl;
}

function buildExotelMediaUrl(
  recordingUrl: string,
  accountSid: string
): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(recordingUrl);
  } catch {
    throw new Error("Stored recording URL is invalid");
  }
  const accountPrefix = `/exotelrecordings/${encodeURIComponent(accountSid)}/`;
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname.toLowerCase() !== EXOTEL_RECORDING_HOST ||
    !parsedUrl.pathname.startsWith(accountPrefix) ||
    !/\.(mp3|wav)$/i.test(parsedUrl.pathname)
  ) {
    throw new Error("Recording URL is not a documented Exotel recording URL");
  }
  return parsedUrl;
}

//--------------------------------------------------
// JSON Error Response
//--------------------------------------------------

function jsonError(
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    {
      success:
        false,

      message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",

        Pragma:
          "no-cache",
      },
    }
  );
}

//--------------------------------------------------
// Stream Recording
//--------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const startedAt =
    process.hrtime.bigint();

  try {
    //----------------------------------------
    // Authentication And Authorization
    //----------------------------------------

    const user =
      await requireRole(
        RECORDING_ROLES
      );

    //----------------------------------------
    // Call ID
    //----------------------------------------

    const {
      id,
    } =
      await context.params;

    const callId =
      id.trim();

    if (
      !callId
    ) {
      return jsonError(
        "Call ID is required",
        400
      );
    }

    await assertCallOwnership(
      callId,
      user
    );

    //----------------------------------------
    // Load Recording Metadata
    //----------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            callId,
        },

        select: {
          id:
            true,

          campaignId:
            true,

          campaignRunId:
            true,

          contactId:
            true,

          providerCallId:
            true,

          provider:
            true,

          attemptNumber:
            true,

          recordingUrl:
            true,

          recordingId: true,
        },
      });

    if (
      !call
    ) {
      routeLog.warn(
        {
          event:
            "recording.proxy.call_not_found",

          callId,

          userId:
            user.id,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Recording proxy call was not found"
      );

      return jsonError(
        "Call not found",
        404
      );
    }

    const log =
      createCallLogger(
        call.id,
        {
          campaignId:
            call.campaignId,

          campaignRunId:
            call.campaignRunId,

          contactId:
            call.contactId,

          providerCallId:
            call.providerCallId,

          attemptNumber:
            call.attemptNumber,

          userId:
            user.id,

          userRole:
            user.role,
        }
      );

    if (!call.recordingUrl) {
      log.warn(
        {
          event:
            "recording.proxy.not_available",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Call recording is not available"
      );

      return jsonError(
        "Recording is not available",
        404
      );
    }

    //----------------------------------------
    // Private Provider Credentials
    //----------------------------------------

    const isExotel = call.provider === "EXOTEL";
    const isPlivo = call.provider === "PLIVO";

    const accountSid =
      (isExotel
        ? process.env.EXOTEL_ACCOUNT_SID
        : isPlivo
          ? process.env.PLIVO_AUTH_ID
        : process.env.TWILIO_ACCOUNT_SID)
        ?.trim();

    const authToken = isExotel
      ? undefined
      : isPlivo
        ? process.env.PLIVO_AUTH_TOKEN?.trim()
      : process.env.TWILIO_AUTH_TOKEN?.trim();

    if (
      !accountSid ||
      (!isExotel && !authToken)
    ) {
      log.error(
        {
          event:
            "recording.proxy.credentials_missing",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Recording provider credentials are missing"
      );

      return jsonError(
        "Recording service is unavailable",
        503
      );
    }

    //----------------------------------------
    // Validate And Normalize URL
    //----------------------------------------

    let mediaUrl:
      URL;

    try {
      if (isPlivo) {
        const recordingId = call.recordingId ?? parsePlivoRecordingReference(call.recordingUrl);
        if (!recordingId) throw new Error("Plivo recording reference is invalid");
        log.info({ event: "plivo.recording.fetch_started", recordingId, durationMs: getDurationMs(startedAt) }, "Plivo recording lookup started");
        mediaUrl = await new PlivoProvider().getRecordingMediaUrl(recordingId);
      } else {
        mediaUrl = isExotel ? buildExotelMediaUrl(call.recordingUrl, accountSid) : buildTwilioMediaUrl(call.recordingUrl, accountSid);
      }
    } catch (
      validationError
    ) {
      log.error(
        {
          event:
            "recording.proxy.url_rejected",

          durationMs:
            getDurationMs(
              startedAt
            ),

          error:
            normalizeError(
              validationError
            ),
        },
        "Unsafe or invalid recording URL rejected"
      );

      return jsonError(
        "Stored recording URL is invalid",
        502
      );
    }

    //----------------------------------------
    // Provider Request Headers
    //----------------------------------------

    const providerHeaders = new Headers({ Accept: "audio/mpeg" });

    if (!isExotel && authToken) {
      providerHeaders.set("Authorization", buildBasicAuthHeader(accountSid, authToken));
    }

    const rangeHeader =
      request.headers.get(
        "range"
      );

    if (
      rangeHeader
    ) {
      providerHeaders.set(
        "Range",
        rangeHeader
      );
    }

    log.info(
      {
        event:
          "recording.proxy.fetch.started",

        hasRangeRequest:
          Boolean(
            rangeHeader
          ),
      },
      "Recording provider fetch started"
    );

    //----------------------------------------
    // Fetch With Timeout
    //----------------------------------------

    const abortController =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          abortController.abort();
        },
        30_000
      );

    let recordingResponse:
      Response;

    try {
      recordingResponse =
        await fetch(
          mediaUrl,
          {
            method:
              "GET",

            headers:
              providerHeaders,

            cache:
              "no-store",

            redirect:
              "error",

            signal:
              abortController.signal,
          }
        );
    } finally {
      clearTimeout(
        timeout
      );
    }

    //----------------------------------------
    // Validate Provider Response
    //----------------------------------------

    if (
      !recordingResponse.ok &&
      recordingResponse.status !==
        206
    ) {
      log.error(
        {
          event:
            "recording.proxy.provider_failed",

          providerStatus:
            recordingResponse.status,

          hasRangeRequest:
            Boolean(
              rangeHeader
            ),

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Twilio recording provider request failed"
      );

      if (
        recordingResponse.status ===
        404
      ) {
        return jsonError(
          "Recording was not found at the provider",
          404
        );
      }

      if (
        recordingResponse.status ===
          401 ||
        recordingResponse.status ===
          403
      ) {
        return jsonError(
          "Recording provider authentication failed",
          502
        );
      }

      return jsonError(
        "Unable to load recording",
        502
      );
    }

    if (
      !recordingResponse.body
    ) {
      log.error(
        {
          event:
            "recording.proxy.empty_provider_response",

          providerStatus:
            recordingResponse.status,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Recording provider returned an empty response"
      );

      return jsonError(
        "Recording provider returned an empty response",
        502
      );
    }

    //----------------------------------------
    // Browser Response Headers
    //----------------------------------------

    const responseHeaders =
      new Headers();

    responseHeaders.set(
      "Content-Type",
      recordingResponse.headers.get(
        "content-type"
      ) ??
      "audio/mpeg"
    );

    responseHeaders.set(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    responseHeaders.set(
      "Pragma",
      "no-cache"
    );

    responseHeaders.set(
      "Accept-Ranges",
      recordingResponse.headers.get(
        "accept-ranges"
      ) ??
      "bytes"
    );

    const download = request.nextUrl.searchParams.get("download") === "1";
    responseHeaders.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="call-${callId}.mp3"`
    );

    const passthroughHeaders = [
      "content-length",
      "content-range",
      "etag",
      "last-modified",
    ];

    for (
      const headerName of
      passthroughHeaders
    ) {
      const headerValue =
        recordingResponse.headers.get(
          headerName
        );

      if (
        headerValue
      ) {
        responseHeaders.set(
          headerName,
          headerValue
        );
      }
    }

    log.info(
      {
        event:
          "recording.proxy.fetch.completed",

        providerStatus:
          recordingResponse.status,

        contentType:
          responseHeaders.get(
            "content-type"
          ),

        contentLength:
          responseHeaders.get(
            "content-length"
          ),

        contentRange:
          responseHeaders.get(
            "content-range"
          ),

        hasRangeRequest:
          Boolean(
            rangeHeader
          ),

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Recording stream returned to browser"
    );

    if (isPlivo) log.info({ event: "plivo.recording.fetch_completed", durationMs: getDurationMs(startedAt) }, "Plivo recording stream returned to browser");

    //----------------------------------------
    // Stream Provider Response
    //----------------------------------------

    return new NextResponse(
      recordingResponse.body,
      {
        status:
          recordingResponse.status,

        headers:
          responseHeaders,
      }
    );
  } catch (
    error
  ) {
    //----------------------------------------
    // Authentication Failure
    //----------------------------------------

    if (
      isAuthenticationError(
        error
      )
    ) {
      routeLog.warn(
        {
          event:
            "recording.proxy.authentication_failed",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Unauthenticated recording request rejected"
      );

      return jsonError(
        error.message,
        401
      );
    }

    //----------------------------------------
    // Authorization Failure
    //----------------------------------------

    if (
      isAuthorizationError(
        error
      )
    ) {
      routeLog.warn(
        {
          event:
            "recording.proxy.authorization_failed",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Unauthorized recording request rejected"
      );

      return jsonError(
        error.message,
        403
      );
    }

    //----------------------------------------
    // Provider Timeout
    //----------------------------------------

    if (
      error instanceof
        DOMException &&
      error.name ===
        "AbortError"
    ) {
      routeLog.error(
        {
          event:
            "recording.proxy.timeout",

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Twilio recording provider request timed out"
      );

      return jsonError(
        "Recording provider timed out",
        504
      );
    }

    //----------------------------------------
    // Unexpected Failure
    //----------------------------------------

    routeLog.error(
      {
        event:
          "recording.proxy.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Failed to stream call recording"
    );

    return jsonError(
      "Failed to stream recording",
      500
    );
  }
}

function parsePlivoRecordingReference(value: string): string | null {
  const match = /^plivo-recording:([^\s]+)$/.exec(value.trim());
  return match?.[1] ?? null;
}
