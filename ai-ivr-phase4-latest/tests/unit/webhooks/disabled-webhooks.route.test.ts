import {
  NextRequest,
} from "next/server";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  POST as callsWebhookPost,
} from "@/app/api/calls/webhook/route";

import {
  POST as telephonyWebhookPost,
} from "@/app/api/telephony/webhook/route";

import {
  POST as legacyTelephonyWebhookPost,
} from "@/app/api/webhooks/telephony/route";

import {
  GET as twilioMediaGet,
  POST as twilioMediaPost,
} from "@/app/api/twilio/media/route";

//--------------------------------------------------
// Request Factory
//--------------------------------------------------

function createRequest(
  options: {
    method?: "GET" | "POST";

    url?: string;

    headers?: Record<
      string,
      string
    >;

    body?: string;
  } = {}
): NextRequest {
  const method =
    options.method ??
    "POST";

  const init:
  ConstructorParameters<
    typeof NextRequest
  >[1] = {
    method,

    headers:
      options.headers,
  };

  if (
    method !==
    "GET"
  ) {
    init.body =
      options.body ??
      JSON.stringify({
        status:
          "completed",
      });
  }

  return new NextRequest(
    options.url ??
      "https://example.com/api/disabled",
    init
  );
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "disabled webhook routes",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        vi.spyOn(
          console,
          "warn"
        ).mockImplementation(
          () => undefined
        );
      }
    );

    //------------------------------------------------
    // Legacy Call Webhook
    //------------------------------------------------

    it(
      "returns 410 for POST /api/calls/webhook",
      async () => {
        const response =
          await callsWebhookPost();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          410
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "This webhook endpoint is disabled",
        });

        expect(
          console.warn
        ).toHaveBeenCalledWith(
          "Rejected request to disabled legacy webhook",
          {
            route:
              "/api/calls/webhook",
          }
        );
      }
    );

    //------------------------------------------------
    // Generic Telephony Webhook
    //------------------------------------------------

    it(
      "returns 410 for POST /api/telephony/webhook",
      async () => {
        const response =
          await telephonyWebhookPost();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          410
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "This webhook endpoint is disabled",
        });

        expect(
          console.warn
        ).toHaveBeenCalledWith(
          "Rejected request to disabled generic telephony webhook",
          {
            route:
              "/api/telephony/webhook",
          }
        );
      }
    );

    //------------------------------------------------
    // Legacy Telephony Webhook
    //------------------------------------------------

    it(
      "returns 410 for POST /api/webhooks/telephony",
      async () => {
        const response =
          await legacyTelephonyWebhookPost();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          410
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "This webhook endpoint is disabled",
        });

        expect(
          console.warn
        ).toHaveBeenCalledWith(
          "Rejected request to disabled legacy telephony webhook",
          {
            route:
              "/api/webhooks/telephony",
          }
        );
      }
    );

    //------------------------------------------------
    // Twilio Media GET
    //------------------------------------------------

    it(
      "returns 410 for GET /api/twilio/media",
      async () => {
        const request =
          createRequest({
            method:
              "GET",

            url:
              "https://example.com/api/twilio/media",

            headers: {
              "user-agent":
                "Vitest Agent",
            },
          });

        const response =
          await twilioMediaGet(
            request
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          410
        );

        expect(
          response.headers.get(
            "cache-control"
          )
        ).toBe(
          "no-store"
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "Twilio media HTTP endpoint is disabled",

          mediaTransport:
            "WebSocket",

          websocketPath:
            "/api/twilio/stream",
        });

        expect(
          console.warn
        ).toHaveBeenCalledWith(
          "Request received on disabled Twilio media HTTP endpoint",
          {
            method:
              "GET",

            pathname:
              "/api/twilio/media",

            userAgent:
              "Vitest Agent",
          }
        );
      }
    );

    //------------------------------------------------
    // Twilio Media POST
    //------------------------------------------------

    it(
      "returns 410 for POST /api/twilio/media",
      async () => {
        const request =
          createRequest({
            method:
              "POST",

            url:
              "https://example.com/api/twilio/media",

            headers: {
              "content-type":
                "application/json",

              "user-agent":
                "TwilioProxy/1.1",
            },

            body:
              JSON.stringify({
                media:
                  "audio-data",
              }),
          });

        const response =
          await twilioMediaPost(
            request
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          410
        );

        expect(
          response.headers.get(
            "cache-control"
          )
        ).toBe(
          "no-store"
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "Twilio media must be sent through the WebSocket stream",

          mediaTransport:
            "WebSocket",

          websocketPath:
            "/api/twilio/stream",
        });

        expect(
          console.warn
        ).toHaveBeenCalledWith(
          "POST received on disabled Twilio media HTTP endpoint",
          {
            method:
              "POST",

            pathname:
              "/api/twilio/media",

            contentType:
              "application/json",

            userAgent:
              "TwilioProxy/1.1",
          }
        );
      }
    );

    //------------------------------------------------
    // Response Safety
    //------------------------------------------------

    it(
      "does not expose stack traces or internal implementation details",
      async () => {
        const responses =
          await Promise.all([
            callsWebhookPost(),

            telephonyWebhookPost(),

            legacyTelephonyWebhookPost(),

            twilioMediaGet(
              createRequest({
                method:
                  "GET",

                url:
                  "https://example.com/api/twilio/media",
              })
            ),

            twilioMediaPost(
              createRequest({
                method:
                  "POST",

                url:
                  "https://example.com/api/twilio/media",
              })
            ),
          ]);

        for (
          const response of responses
        ) {
          const body =
            await response.json();

          const serialized =
            JSON.stringify(
              body
            ).toLowerCase();

          expect(
            response.status
          ).toBe(
            410
          );

          expect(
            serialized
          ).not.toContain(
            "stack"
          );

          expect(
            serialized
          ).not.toContain(
            "prisma"
          );

          expect(
            serialized
          ).not.toContain(
            "database"
          );

          expect(
            serialized
          ).not.toContain(
            "redis"
          );

          expect(
            serialized
          ).not.toContain(
            "token"
          );
        }
      }
    );

    //------------------------------------------------
    // Deterministic Responses
    //------------------------------------------------

    it(
      "returns the same disabled response for repeated legacy webhook requests",
      async () => {
        const firstResponse =
          await callsWebhookPost();

        const secondResponse =
          await callsWebhookPost();

        expect(
          firstResponse.status
        ).toBe(
          410
        );

        expect(
          secondResponse.status
        ).toBe(
          410
        );

        expect(
          await firstResponse.json()
        ).toEqual(
          await secondResponse.json()
        );
      }
    );
  }
);