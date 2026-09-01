import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      logInfo:
        vi.fn(),

      logError:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () => ({
          info:
            mocks.logInfo,

          error:
            mocks.logError,

          warn:
            vi.fn(),

          debug:
            vi.fn(),
        })
      ),

    normalizeError:
      vi.fn(
        (
          err: unknown
        ) => ({
          message:
            err instanceof
            Error
              ? err.message
              : String(
                  err
                ),
        })
      ),
  })
);

import {
  MetaWhatsAppAdapter,
} from "@/providers/messaging/meta-whatsapp.adapter";

describe(
  "MetaWhatsAppAdapter",
  () => {
    let adapter: MetaWhatsAppAdapter;

    const originalEnv =
      process.env;

    const originalFetch =
      globalThis.fetch;

    beforeEach(
      () => {
        vi.clearAllMocks();

        process.env = {
          ...originalEnv,

          META_WHATSAPP_ACCESS_TOKEN:
            "meta-token",

          META_WHATSAPP_PHONE_NUMBER_ID:
            "phone-id-123",

          META_GRAPH_API_VERSION:
            "v23.0",
        };

        adapter =
          new MetaWhatsAppAdapter();
      }
    );

    afterEach(
      () => {
        process.env =
          originalEnv;

        globalThis.fetch =
          originalFetch;
      }
    );

    it(
      "implements MessagingProviderAdapter with correct provider and capabilities",
      () => {
        expect(
          adapter.provider
        ).toBe(
          "META"
        );

        expect(
          adapter.channels
        ).toEqual([
          "WHATSAPP",
        ]);

        expect(
          adapter.capabilities
        ).toEqual([
          "WHATSAPP_OUTBOUND",
          "WHATSAPP_TEMPLATE",
          "WHATSAPP_STATUS_CALLBACK",
          "WHATSAPP_READ_RECEIPT",
        ]);

        expect(
          adapter.supports(
            "WHATSAPP"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "WHATSAPP",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "WHATSAPP",
            "WHATSAPP_TEMPLATE"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "SMS" as any
          )
        ).toBe(
          false
        );
      }
    );

    it(
      "isConfigured returns true when environment tokens exist",
      () => {
        expect(
          adapter.isConfigured()
        ).toBe(
          true
        );
      }
    );

    it(
      "isConfigured returns false when tokens are missing",
      () => {
        delete process.env.META_WHATSAPP_ACCESS_TOKEN;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

    it(
      "rejects non-WhatsApp channels",
      async () => {
        const result =
          await adapter.send({
            channel:
              "SMS" as any,

            recipient:
              "+15551234567",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "CHANNEL_NOT_SUPPORTED"
          );
        }
      }
    );

    it(
      "requires templateName and templateLanguage",
      async () => {
        const result =
          await adapter.send({
            channel:
              "WHATSAPP",

            recipient:
              "+15551234567",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "WHATSAPP_TEMPLATE_REQUIRED"
          );
        }
      }
    );

    it(
      "successfully sends WhatsApp template message via Graph API",
      async () => {
        globalThis.fetch =
          vi.fn().mockResolvedValue({
            ok:
              true,

            status:
              200,

            text:
              async () =>
                JSON.stringify({
                  messaging_product:
                    "whatsapp",

                  contacts: [
                    {
                      input:
                        "15551234567",

                      wa_id:
                        "15551234567",
                    },
                  ],

                  messages: [
                    {
                      id:
                        "wamid.HBgLMTIzNDU=",
                    },
                  ],
                }),
          }) as any;

        const result =
          await adapter.send({
            channel:
              "WHATSAPP",

            recipient:
              "+1 (555) 123-4567",

            templateName:
              "lead_follow_up",

            templateLanguage:
              "en_US",

            templateComponents: [
              {
                type:
                  "body",

                parameters: [
                  {
                    type:
                      "text",

                    text:
                      "Alice",
                  },
                ],
              },
            ],
          });

        expect(
          result
        ).toEqual({
          success:
            true,

          provider:
            "META",

          channel:
            "WHATSAPP",

          providerMessageId:
            "wamid.HBgLMTIzNDU=",

          status:
            "accepted",
        });

        expect(
          globalThis.fetch
        ).toHaveBeenCalledWith(
          "https://graph.facebook.com/v23.0/phone-id-123/messages",
          expect.objectContaining({
            method:
              "POST",

            headers: {
              Authorization:
                "Bearer meta-token",

              "Content-Type":
                "application/json",
            },
          })
        );
      }
    );

    it(
      "handles Meta API error response safely",
      async () => {
        globalThis.fetch =
          vi.fn().mockResolvedValue({
            ok:
              false,

            status:
              400,

            text:
              async () =>
                JSON.stringify({
                  error: {
                    message:
                      "Template does not exist",

                    code:
                      100,

                    type:
                      "OAuthException",
                  },
                }),
          }) as any;

        const result =
          await adapter.send({
            channel:
              "WHATSAPP",

            recipient:
              "+15551234567",

            templateName:
              "non_existent",

            templateLanguage:
              "en_US",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "META_100"
          );
        }
      }
    );
  }
);
