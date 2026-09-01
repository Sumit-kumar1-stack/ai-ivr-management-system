import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMessagingProviders,
  getAvailableMessagingProviders,
  getMissingConfigurationKeys,
  getMessagingCapabilityMatrix,
  getMessagingProvider,
  getMessagingProviderCapabilities,
  getMessagingProviderDescriptor,
  getMessagingProviderDescriptors,
  getMessagingProviderStatus,
  getPreferredMessagingProvider,
  getProviderLabel,
  isMessagingCapabilitySupported,
  isMessagingChannelAvailable,
  isProviderEnabled,
  normalizeProviderName,
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
      "registers Twilio, Plivo, and Exotel for SMS and Meta for WhatsApp by default",
      () => {
        const twilio =
          getMessagingProvider(
            "TWILIO"
          );

        const plivo =
          getMessagingProvider(
            "PLIVO"
          );

        const exotel =
          getMessagingProvider(
            "EXOTEL"
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
          plivo
        ).not.toBeNull();

        expect(
          plivo?.provider
        ).toBe(
          "PLIVO"
        );

        expect(
          plivo?.channels
        ).toEqual([
          "SMS",
        ]);

        expect(
          exotel
        ).not.toBeNull();

        expect(
          exotel?.provider
        ).toBe(
          "EXOTEL"
        );

        expect(
          exotel?.channels
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
      "Plivo advertises only supported messaging capabilities",
      () => {
        const plivo =
          getMessagingProvider(
            "PLIVO"
          );

        expect(
          plivo?.capabilities
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);

        expect(
          plivo?.supports(
            "SMS",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          plivo?.supports(
            "SMS",
            "SMS_STATUS_CALLBACK"
          )
        ).toBe(
          true
        );

        expect(
          plivo?.supports(
            "SMS",
            "WHATSAPP_OUTBOUND" as any
          )
        ).toBe(
          false
        );

        expect(
          plivo?.supports(
            "WHATSAPP" as any
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
          true
        );

        expect(
          providerSupportsCapability(
            "PLIVO",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "PLIVO"
          )
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);
      }
    );

    it(
      "Exotel advertises only supported messaging capabilities",
      () => {
        const exotel =
          getMessagingProvider(
            "EXOTEL"
          );

        expect(
          exotel?.capabilities
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);

        expect(
          exotel?.supports(
            "SMS",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          exotel?.supports(
            "SMS",
            "SMS_STATUS_CALLBACK"
          )
        ).toBe(
          true
        );

        expect(
          exotel?.supports(
            "SMS",
            "WHATSAPP_OUTBOUND" as any
          )
        ).toBe(
          false
        );

        expect(
          exotel?.supports(
            "WHATSAPP" as any
          )
        ).toBe(
          false
        );

        expect(
          providerSupportsCapability(
            "EXOTEL",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          providerSupportsCapability(
            "EXOTEL",
            "WHATSAPP_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "EXOTEL"
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
      "returns empty capabilities and false for unregistered providers (MOCK)",
      () => {
        expect(
          getMessagingProvider(
            "MOCK"
          )
        ).toBeNull();

        expect(
          providerSupportsChannel(
            "MOCK",
            "SMS"
          )
        ).toBe(
          false
        );

        expect(
          providerSupportsCapability(
            "MOCK",
            "SMS_OUTBOUND"
          )
        ).toBe(
          false
        );

        expect(
          getMessagingProviderCapabilities(
            "MOCK"
          )
        ).toEqual([]);

        expect(
          isMessagingCapabilitySupported(
            "MOCK",
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
          matrix.PLIVO
        ).toBeDefined();

        expect(
          matrix.PLIVO.channels
        ).toContain(
          "SMS"
        );

        expect(
          matrix.PLIVO.capabilities
        ).toContain(
          "SMS_OUTBOUND"
        );

        expect(
          matrix.EXOTEL
        ).toBeDefined();

        expect(
          matrix.EXOTEL.channels
        ).toContain(
          "SMS"
        );

        expect(
          matrix.EXOTEL.capabilities
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
      "resolves Plivo for SMS outbound when SMS_PROVIDER=plivo",
      () => {
        process.env.SMS_PROVIDER =
          "plivo";

        const plivo =
          getMessagingProvider(
            "PLIVO"
          );

        vi.spyOn(
          plivo!,
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
          "PLIVO"
        );
      }
    );

    it(
      "resolves Exotel for SMS outbound when SMS_PROVIDER=exotel",
      () => {
        process.env.SMS_PROVIDER =
          "exotel";

        const exotel =
          getMessagingProvider(
            "EXOTEL"
          );

        vi.spyOn(
          exotel!,
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
          "EXOTEL"
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
              "EXOTEL",
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
          "unknown_vendor";

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

    //------------------------------------------------
    // Phase M4: Provider Status & Health Descriptors
    //------------------------------------------------

    describe(
      "Phase M4: Provider Descriptors & Channel Availability",
      () => {
        it(
          "normalizeProviderName normalizes case and handles unknown values safely",
          () => {
            expect(
              normalizeProviderName(
                "twilio"
              )
            ).toBe(
              "TWILIO"
            );

            expect(
              normalizeProviderName(
                "Plivo"
              )
            ).toBe(
              "PLIVO"
            );

            expect(
              normalizeProviderName(
                "EXOTEL"
              )
            ).toBe(
              "EXOTEL"
            );

            expect(
              normalizeProviderName(
                "meta"
              )
            ).toBe(
              "META"
            );

            expect(
              normalizeProviderName(
                "bad-provider"
              )
            ).toBeNull();

            expect(
              normalizeProviderName(
                undefined
              )
            ).toBeNull();
          }
        );

        it(
          "getProviderLabel returns human-readable labels for providers",
          () => {
            expect(
              getProviderLabel(
                "TWILIO"
              )
            ).toBe(
              "Twilio"
            );

            expect(
              getProviderLabel(
                "PLIVO"
              )
            ).toBe(
              "Plivo"
            );

            expect(
              getProviderLabel(
                "EXOTEL"
              )
            ).toBe(
              "Exotel"
            );

            expect(
              getProviderLabel(
                "META"
              )
            ).toBe(
              "Meta WhatsApp"
            );
          }
        );

        it(
          "getPreferredMessagingProvider returns configured provider or defaults safely",
          () => {
            // Default SMS
            delete process.env.SMS_PROVIDER;

            expect(
              getPreferredMessagingProvider(
                "SMS"
              )
            ).toBe(
              "TWILIO"
            );

            // Explicit SMS
            process.env.SMS_PROVIDER =
              "plivo";

            expect(
              getPreferredMessagingProvider(
                "SMS"
              )
            ).toBe(
              "PLIVO"
            );

            process.env.SMS_PROVIDER =
              "EXOTEL";

            expect(
              getPreferredMessagingProvider(
                "SMS"
              )
            ).toBe(
              "EXOTEL"
            );

            // Invalid SMS fails safely to null
            process.env.SMS_PROVIDER =
              "unknown_vendor";

            expect(
              getPreferredMessagingProvider(
                "SMS"
              )
            ).toBeNull();

            // Default WhatsApp
            delete process.env.WHATSAPP_PROVIDER;

            expect(
              getPreferredMessagingProvider(
                "WHATSAPP"
              )
            ).toBe(
              "META"
            );

            // Invalid WhatsApp fails safely to null
            process.env.WHATSAPP_PROVIDER =
              "invalid_wa";

            expect(
              getPreferredMessagingProvider(
                "WHATSAPP"
              )
            ).toBeNull();
          }
        );

        it(
          "isProviderEnabled reflects deployment provider selection independently for SMS and WhatsApp",
          () => {
            delete process.env.SMS_PROVIDER;

            expect(
              isProviderEnabled(
                "TWILIO",
                "SMS"
              )
            ).toBe(
              true
            );

            expect(
              isProviderEnabled(
                "PLIVO",
                "SMS"
              )
            ).toBe(
              false
            );

            expect(
              isProviderEnabled(
                "EXOTEL",
                "SMS"
              )
            ).toBe(
              false
            );

            process.env.SMS_PROVIDER =
              "plivo";

            expect(
              isProviderEnabled(
                "TWILIO",
                "SMS"
              )
            ).toBe(
              false
            );

            expect(
              isProviderEnabled(
                "PLIVO",
                "SMS"
              )
            ).toBe(
              true
            );

            expect(
              isProviderEnabled(
                "EXOTEL",
                "SMS"
              )
            ).toBe(
              false
            );

            process.env.SMS_PROVIDER =
              "exotel";

            expect(
              isProviderEnabled(
                "EXOTEL",
                "SMS"
              )
            ).toBe(
              true
            );

            expect(
              isProviderEnabled(
                "PLIVO",
                "SMS"
              )
            ).toBe(
              false
            );

            // WhatsApp channel enabled
            expect(
              isProviderEnabled(
                "META",
                "WHATSAPP"
              )
            ).toBe(
              true
            );

            process.env.WHATSAPP_ENABLED =
              "false";

            expect(
              isProviderEnabled(
                "META",
                "WHATSAPP"
              )
            ).toBe(
              false
            );
          }
        );

        it(
          "getMissingConfigurationKeys returns safe environment variable names and never exposes secrets",
          () => {
            delete process.env.PLIVO_AUTH_ID;
            delete process.env.PLIVO_AUTH_TOKEN;
            delete process.env.PLIVO_SMS_FROM;

            const missingPlivo =
              getMissingConfigurationKeys(
                "PLIVO",
                "SMS"
              );

            expect(
              missingPlivo
            ).toContain(
              "PLIVO_AUTH_ID"
            );

            expect(
              missingPlivo
            ).toContain(
              "PLIVO_AUTH_TOKEN"
            );

            expect(
              missingPlivo
            ).toContain(
              "PLIVO_SMS_FROM"
            );

            delete process.env.EXOTEL_ACCOUNT_SID;
            delete process.env.EXOTEL_SMS_FROM;

            const missingExotel =
              getMissingConfigurationKeys(
                "EXOTEL",
                "SMS"
              );

            expect(
              missingExotel
            ).toContain(
              "EXOTEL_ACCOUNT_SID"
            );

            expect(
              missingExotel
            ).toContain(
              "EXOTEL_SMS_FROM"
            );
          }
        );

        it(
          "getMessagingProviderDescriptor returns complete user-safe runtime descriptor",
          () => {
            process.env.SMS_PROVIDER =
              "plivo";

            const plivoAdapter =
              getMessagingProvider(
                "PLIVO"
              );

            vi.spyOn(
              plivoAdapter!,
              "isConfigured"
            ).mockReturnValue(
              false
            );

            const descriptor =
              getMessagingProviderDescriptor(
                "PLIVO",
                "SMS"
              );

            expect(
              descriptor
            ).toMatchObject({
              provider:
                "PLIVO",

              channel:
                "SMS",

              label:
                "Plivo",

              supported:
                true,

              configured:
                false,

              enabled:
                true,

              available:
                false,
            });

            expect(
              descriptor.missingConfigurationKeys
            ).toBeDefined();
          }
        );

        it(
          "getMessagingProviderDescriptors returns descriptors for all known SMS and WhatsApp providers",
          () => {
            const allDescriptors =
              getMessagingProviderDescriptors();

            expect(
              allDescriptors.length
            ).toBe(
              4
            ); // Twilio, Plivo, Exotel for SMS, Meta for WhatsApp

            const smsDescriptors =
              getMessagingProviderDescriptors(
                "SMS"
              );

            expect(
              smsDescriptors.map(
                d => d.provider
              )
            ).toEqual([
              "TWILIO",
              "PLIVO",
              "EXOTEL",
            ]);

            const waDescriptors =
              getMessagingProviderDescriptors(
                "WHATSAPP"
              );

            expect(
              waDescriptors.map(
                d => d.provider
              )
            ).toEqual([
              "META",
            ]);
          }
        );

        it(
          "isMessagingChannelAvailable returns true only when supported, configured, and enabled",
          () => {
            const twilioAdapter =
              getMessagingProvider(
                "TWILIO"
              );

            delete process.env.SMS_PROVIDER;

            // Twilio configured & enabled
            vi.spyOn(
              twilioAdapter!,
              "isConfigured"
            ).mockReturnValue(
              true
            );

            expect(
              isMessagingChannelAvailable(
                "SMS"
              )
            ).toBe(
              true
            );

            // Twilio not configured
            vi.spyOn(
              twilioAdapter!,
              "isConfigured"
            ).mockReturnValue(
              false
            );

            expect(
              isMessagingChannelAvailable(
                "SMS"
              )
            ).toBe(
              false
            );
          }
        );

        it(
          "getAvailableMessagingProviders returns only providers that are available",
          () => {
            process.env.SMS_PROVIDER =
              "exotel";

            const exotelAdapter =
              getMessagingProvider(
                "EXOTEL"
              );

            vi.spyOn(
              exotelAdapter!,
              "isConfigured"
            ).mockReturnValue(
              true
            );

            const available =
              getAvailableMessagingProviders(
                "SMS"
              );

            expect(
              available.length
            ).toBe(
              1
            );

            expect(
              available[0].provider
            ).toBe(
              "EXOTEL"
            );
          }
        );

        it(
          "voice credentials alone do not configure SMS providers",
          () => {
            // Exotel voice config present, SMS_FROM absent
            delete process.env.EXOTEL_SMS_FROM;

            process.env.EXOTEL_CALLER_ID =
              "+919876543210";

            const exotelDescriptor =
              getMessagingProviderDescriptor(
                "EXOTEL",
                "SMS"
              );

            expect(
              exotelDescriptor.configured
            ).toBe(
              false
            );

            expect(
              exotelDescriptor.missingConfigurationKeys
            ).toContain(
              "EXOTEL_SMS_FROM"
            );

            // Plivo voice config present, SMS_FROM absent
            delete process.env.PLIVO_SMS_FROM;

            process.env.PLIVO_CALLER_ID =
              "+15551234567";

            const plivoDescriptor =
              getMessagingProviderDescriptor(
                "PLIVO",
                "SMS"
              );

            expect(
              plivoDescriptor.configured
            ).toBe(
              false
            );

            expect(
              plivoDescriptor.missingConfigurationKeys
            ).toContain(
              "PLIVO_SMS_FROM"
            );
          }
        );

        it(
          "telephony, SMS, and WhatsApp provider configurations operate completely independently",
          () => {
            process.env.TELEPHONY_PROVIDER =
              "plivo";

            process.env.SMS_PROVIDER =
              "exotel";

            process.env.WHATSAPP_PROVIDER =
              "meta";

            expect(
              getPreferredMessagingProvider(
                "SMS"
              )
            ).toBe(
              "EXOTEL"
            );

            expect(
              getPreferredMessagingProvider(
                "WHATSAPP"
              )
            ).toBe(
              "META"
            );

            expect(
              isProviderEnabled(
                "EXOTEL",
                "SMS"
              )
            ).toBe(
              true
            );

            expect(
              isProviderEnabled(
                "PLIVO",
                "SMS"
              )
            ).toBe(
              false
            );
          }
        );
      }
    );
  }
);
