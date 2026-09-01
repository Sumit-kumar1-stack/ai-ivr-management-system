import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMessagingProviders,
  getMessagingCapabilityMatrix,
  getMessagingProvider,
  getMessagingProviderCapabilities,
  isMessagingCapabilitySupported,
  providerSupportsCapability,
  providerSupportsChannel,
  registerMessagingProvider,
  resolveMessagingProvider,
} from "@/services/messaging/messaging-provider-registry.service";

import {
  registerMessagingProviders,
} from "@/services/messaging/register-messaging-providers.service";

import type {
  MessagingProviderAdapter,
} from "@/services/messaging/messaging.types";

describe(
  "Messaging Provider Registry & Capabilities",
  () => {
    const originalEnv =
      process.env;

    beforeEach(
      () => {
        vi.clearAllMocks();

        process.env = {
          ...originalEnv,
        };

        delete process.env.SMS_PROVIDER;

        delete process.env.WHATSAPP_PROVIDER;

        clearMessagingProviders();

        registerMessagingProviders();
      }
    );

    //------------------------------------------------
    // Registration & Default Adapters
    //------------------------------------------------

    it(
      "registers Twilio for SMS and Meta for WhatsApp by default",
      () => {
        const twilio =
          getMessagingProvider(
            "TWILIO"
          );

        const meta =
          getMessagingProvider(
            "META"
          );

        expect(
          twilio
        ).not.toBeNull();

        expect(
          twilio?.provider
        ).toBe(
          "TWILIO"
        );

        expect(
          twilio?.channels
        ).toEqual([
          "SMS",
        ]);

        expect(
          meta
        ).not.toBeNull();

        expect(
          meta?.provider
        ).toBe(
          "META"
        );

        expect(
          meta?.channels
        ).toEqual([
          "WHATSAPP",
        ]);
      }
    );

    //------------------------------------------------
    // Capabilities Inspection
    //------------------------------------------------

    it(
      "Twilio advertises only supported messaging capabilities",
      () => {
        const twilio =
          getMessagingProvider(
            "TWILIO"
          );

        expect(
          twilio?.capabilities
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);

        expect(
          twilio?.supports(
            "SMS",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          twilio?.supports(
            "SMS",
            "SMS_STATUS_CALLBACK"
          )
        ).toBe(
          true
        );

        expect(
          twilio?.supports(
            "SMS",
            "WHATSAPP_OUTBOUND" as any
          )
        ).toBe(
          false
        );

        expect(
          twilio?.supports(
            "WHATSAPP" as any
          )
        ).toBe(
          false
        );

        expect(
          providerSupportsCapability(
            "TWILIO",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          providerSupportsCapability(
            "TWILIO",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "TWILIO"
          )
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);
      }
    );

    it(
      "Meta advertises only supported messaging capabilities",
      () => {
        const meta =
          getMessagingProvider(
            "META"
          );

        expect(
          meta?.capabilities
        ).toEqual([
          "WHATSAPP_OUTBOUND",
          "WHATSAPP_TEMPLATE",
          "WHATSAPP_STATUS_CALLBACK",
          "WHATSAPP_READ_RECEIPT",
        ]);

        expect(
          meta?.supports(
            "WHATSAPP",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          meta?.supports(
            "WHATSAPP",
            "WHATSAPP_TEMPLATE"
          )
        ).toBe(
          true
        );

        expect(
          meta?.supports(
            "WHATSAPP",
            "WHATSAPP_STATUS_CALLBACK"
          )
        ).toBe(
          true
        );

        expect(
          meta?.supports(
            "WHATSAPP",
            "WHATSAPP_READ_RECEIPT"
          )
        ).toBe(
          true
        );

        expect(
          meta?.supports(
            "WHATSAPP",
            "SMS_OUTBOUND" as any
          )
        ).toBe(
          false
        );

        expect(
          meta?.supports(
            "SMS" as any
          )
        ).toBe(
          false
        );

        expect(
          providerSupportsCapability(
            "META",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          providerSupportsCapability(
            "META",
            "SMS_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "META"
          )
        ).toEqual([
          "WHATSAPP_OUTBOUND",
          "WHATSAPP_TEMPLATE",
          "WHATSAPP_STATUS_CALLBACK",
          "WHATSAPP_READ_RECEIPT",
        ]);
      }
    );

    it(
      "returns empty capabilities and false for unregistered providers",
      () => {
        expect(
          getMessagingProvider(
            "PLIVO"
          )
        ).toBeNull();

        expect(
          getMessagingProvider(
            "EXOTEL"
          )
        ).toBeNull();

        expect(
          providerSupportsChannel(
            "PLIVO",
            "SMS"
          )
        ).toBe(
          false
        );

        expect(
          providerSupportsCapability(
            "PLIVO",
            "SMS_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "PLIVO"
          )
        ).toEqual([]);

        expect(
          isMessagingCapabilitySupported(
            "PLIVO",
            "SMS",
            "SMS_OUTBOUND"
          )
        ).toBe(
          false
        );
      }
    );

    //------------------------------------------------
    // Capability Matrix
    //------------------------------------------------

    it(
      "capability matrix returns accurate mapping for all known providers",
      () => {
        const matrix =
          getMessagingCapabilityMatrix();

        expect(
          matrix.TWILIO
        ).toBeDefined();

        expect(
          matrix.TWILIO.channels
        ).toContain(
          "SMS"
        );

        expect(
          matrix.TWILIO.capabilities
        ).toContain(
          "SMS_OUTBOUND"
        );

        expect(
          matrix.META
        ).toBeDefined();

        expect(
          matrix.META.channels
        ).toContain(
          "WHATSAPP"
        );

        expect(
          matrix.META.capabilities
        ).toContain(
          "WHATSAPP_OUTBOUND"
        );

        expect(
          matrix.PLIVO
        ).toEqual({
          channels: [],
          capabilities: [],
          isConfigured: false,
        });

        expect(
          matrix.EXOTEL
        ).toEqual({
          channels: [],
          capabilities: [],
          isConfigured: false,
        });
      }
    );

    //------------------------------------------------
    // Provider Resolution
    //------------------------------------------------

    it(
      "resolves Twilio for SMS outbound by default",
      () => {
        const twilio =
          getMessagingProvider(
            "TWILIO"
          );

        vi.spyOn(
          twilio!,
          "isConfigured"
        ).mockReturnValue(
          true
        );

        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "SMS_OUTBOUND",
          });

        expect(
          resolved
        ).not.toBeNull();

        expect(
          resolved?.provider
        ).toBe(
          "TWILIO"
        );
      }
    );

    it(
      "resolves Meta for WhatsApp outbound by default",
      () => {
        const meta =
          getMessagingProvider(
            "META"
          );

        vi.spyOn(
          meta!,
          "isConfigured"
        ).mockReturnValue(
          true
        );

        const resolved =
          resolveMessagingProvider({
            channel:
              "WHATSAPP",

            capability:
              "WHATSAPP_OUTBOUND",
          });

        expect(
          resolved
        ).not.toBeNull();

        expect(
          resolved?.provider
        ).toBe(
          "META"
        );
      }
    );

    it(
      "rejects unsupported capability safely",
      () => {
        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "WHATSAPP_OUTBOUND",
          });

        expect(
          resolved
        ).toBeNull();
      }
    );

    it(
      "returns null when adapter is not configured",
      () => {
        const twilio =
          getMessagingProvider(
            "TWILIO"
          );

        vi.spyOn(
          twilio!,
          "isConfigured"
        ).mockReturnValue(
          false
        );

        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "SMS_OUTBOUND",
          });

        expect(
          resolved
        ).toBeNull();
      }
    );

    it(
      "respects preferredProvider when available and configured",
      () => {
        const mockAdapter: MessagingProviderAdapter =
          {
            provider:
              "MOCK",

            channels: [
              "SMS",
            ],

            capabilities: [
              "SMS_OUTBOUND",
            ],

            supports(
              channel,
              capability
            ) {
              return (
                channel ===
                  "SMS" &&
                (
                  !capability ||
                  capability ===
                    "SMS_OUTBOUND"
                )
              );
            },

            isConfigured() {
              return true;
            },

            async send() {
              return {
                success:
                  true,

                provider:
                  "MOCK",

                channel:
                  "SMS",

                providerMessageId:
                  "mock-1",

                status:
                  "sent",
              };
            },
          };

        registerMessagingProvider(
          mockAdapter
        );

        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "SMS_OUTBOUND",

            preferredProvider:
              "MOCK",
          });

        expect(
          resolved
        ).not.toBeNull();

        expect(
          resolved?.provider
        ).toBe(
          "MOCK"
        );
      }
    );

    it(
      "returns null if preferredProvider is not registered or not configured",
      () => {
        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "SMS_OUTBOUND",

            preferredProvider:
              "PLIVO",
          });

        expect(
          resolved
        ).toBeNull();
      }
    );

    it(
      "fails safely when explicit environment provider is set to an unknown/unsupported provider",
      () => {
        process.env.SMS_PROVIDER =
          "plivo";

        const resolved =
          resolveMessagingProvider({
            channel:
              "SMS",

            capability:
              "SMS_OUTBOUND",
          });

        expect(
          resolved
        ).toBeNull();
      }
    );
  }
);
