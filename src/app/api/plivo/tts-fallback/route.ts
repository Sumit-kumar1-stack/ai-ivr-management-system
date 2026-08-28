import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createPlivoAuthErrorResponse,
  validatePlivoWebhook,
} from "@/lib/plivo-webhook-auth";
import { prisma } from "@/lib/prisma";
import {
  normalizePlivoInboundPayload,
} from "@/providers/telephony/plivo.provider";
import {
  SAFE_TTS_FAILURE_MESSAGE,
} from "@/services/voice/standard-tts-fallback.constants";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const payload =
      await validatePlivoWebhook(
        request
      );
    const callId =
      request.nextUrl.searchParams
        .get("callId")
        ?.trim();
    const providerCallId =
      normalizePlivoInboundPayload(
        payload
      ).providerCallId;

    if (!callId || !providerCallId) {
      return xml(
        "<Response><Hangup/></Response>",
        400
      );
    }

    const call =
      await prisma.call.findFirst({
        where: {
          id: callId,
          provider: "PLIVO",
          providerCallId,
        },
        select: {
          id: true,
        },
      });

    if (!call) {
      return xml(
        "<Response><Hangup/></Response>",
        403
      );
    }

    return xml(
      `<Response><Speak>${escapeXml(SAFE_TTS_FAILURE_MESSAGE)}</Speak><Hangup/></Response>`
    );
  } catch (error) {
    const auth =
      createPlivoAuthErrorResponse(
        error
      );

    return auth ??
      xml(
        "<Response><Hangup/></Response>",
        500
      );
  }
}

function xml(
  body: string,
  status = 200
): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>${body}`,
    {
      status,
      headers: {
        "Content-Type":
          "application/xml; charset=utf-8",
        "Cache-Control":
          "no-store",
      },
    }
  );
}

function escapeXml(
  value: string
): string {
  return value.replace(
    /[<>&'\"]/g,
    character =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        "\"": "&quot;",
      })[character] ?? character
  );
}
