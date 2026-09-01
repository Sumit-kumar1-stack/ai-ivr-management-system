import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  MessagingChannel,
  OutboundMessageStatus,
} from "@prisma/client";

const mocks =
  vi.hoisted(
    () => ({
      findUnique:
        vi.fn(),

      create:
        vi.fn(),

      update:
        vi.fn(),

      updateMany:
        vi.fn(),

      checkConsent:
        vi.fn(),

      resolveMessagingProvider:
        vi.fn(),

      isWhatsAppDeploymentEnabled:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      outboundMessage: {
        findUnique:
          mocks.findUnique,

        create:
          mocks.create,

        update:
          mocks.update,

        updateMany:
          mocks.updateMany,
      },
    },
  })
);

vi.mock(
  "@/services/messaging/messaging-consent.service",
  () => ({
    checkMessagingConsent:
      mocks.checkConsent,
  })
);

vi.mock(
  "@/config/communication-deployment-capabilities",
  () => ({
    isWhatsAppDeploymentEnabled:
      mocks.isWhatsAppDeploymentEnabled,
  })
);

vi.mock(
  "@/services/messaging/messaging-provider-registry.service",
  () => ({
    resolveMessagingProvider:
      mocks.resolveMessagingProvider,
  })
);

import {
  dispatchCommunicationSms,
  dispatchCommunicationWhatsApp,
} from "@/services/communication/communication-messaging-dispatch.service";

describe(
  "communication-messaging-dispatch.service",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.isWhatsAppDeploymentEnabled.mockReturnValue(
          true
        );

        mocks.checkConsent.mockResolvedValue({
          allowed:
            true,

          phone:
            "+15551234567",
        });

        mocks.findUnique.mockResolvedValue(
          null
        );

        mocks.create.mockImplementation(
          (
            args: any
          ) =>
            Promise.resolve({
              id:
                "outbound-msg-1",

              ...args.data,
            })
        );

        mocks.update.mockImplementation(
          (
            args: any
          ) =>
            Promise.resolve({
              id:
                args.where.id,

              status:
                args.data.status,
            })
        );
      }
    );

    //------------------------------------------------
    // SMS Dispatch
    //------------------------------------------------

    describe(
      "dispatchCommunicationSms",
      () => {
        it(
          "resolves SMS adapter dynamically from registry and dispatches",
          async () => {
            const mockSend =
              vi.fn().mockResolvedValue({
                success:
                  true,

                provider:
                  "TWILIO",

                channel:
                  "SMS",

                providerMessageId:
                  "SM999",

                status:
                  "queued",
              });

            mocks.resolveMessagingProvider.mockReturnValue({
              provider:
                "TWILIO",

              channels: [
                "SMS",
              ],

              capabilities: [
                "SMS_OUTBOUND",
                "SMS_STATUS_CALLBACK",
              ],

              isConfigured:
                () => true,

              send:
                mockSend,
            });

            const result =
              await dispatchCommunicationSms({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Alice",
              });

            expect(
              mocks.resolveMessagingProvider
            ).toHaveBeenCalledWith({
              channel:
                "SMS",

              capability:
                "SMS_OUTBOUND",
            });

            expect(
              mocks.create
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                data:
                  expect.objectContaining({
                    channel:
                      MessagingChannel.SMS,

                    provider:
                      "TWILIO",

                    recipient:
                      "+15551234567",
                  }),
              })
            );

            expect(
              mockSend
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                channel:
                  "SMS",

                recipient:
                  "+15551234567",
              })
            );

            expect(
              result
            ).toEqual({
              success:
                true,

              duplicate:
                false,

              outboundMessageId:
                "outbound-msg-1",

              code:
                null,

              message:
                null,
            });
          }
        );

        it(
          "blocks dispatch when SMS consent is not granted",
          async () => {
            mocks.checkConsent.mockResolvedValueOnce({
              allowed:
                false,

              reason:
                "Recipient opted out of SMS.",
            });

            const result =
              await dispatchCommunicationSms({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Alice",
              });

            expect(
              result
            ).toEqual({
              success:
                false,

              duplicate:
                false,

              outboundMessageId:
                null,

              code:
                "SMS_CONSENT_REQUIRED",

              message:
                "Recipient opted out of SMS.",
            });

            expect(
              mocks.resolveMessagingProvider
            ).not.toHaveBeenCalled();

            expect(
              mocks.create
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "fails safely when no SMS provider is configured in the registry",
          async () => {
            mocks.resolveMessagingProvider.mockReturnValue(
              null
            );

            const result =
              await dispatchCommunicationSms({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Alice",
              });

            expect(
              result
            ).toEqual({
              success:
                false,

              duplicate:
                false,

              outboundMessageId:
                null,

              code:
                "SMS_PROVIDER_NOT_CONFIGURED",

              message:
                "No configured SMS messaging provider is available.",
            });

            expect(
              mocks.create
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "handles provider dispatch rejection and marks message failed",
          async () => {
            const mockSend =
              vi.fn().mockResolvedValue({
                success:
                  false,

                provider:
                  "TWILIO",

                channel:
                  "SMS",

                code:
                  "TWILIO_SMS_FAILED",

                message:
                  "Twilio network error",
              });

            mocks.resolveMessagingProvider.mockReturnValue({
              provider:
                "TWILIO",

              channels: [
                "SMS",
              ],

              capabilities: [
                "SMS_OUTBOUND",
              ],

              isConfigured:
                () => true,

              send:
                mockSend,
            });

            const result =
              await dispatchCommunicationSms({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Alice",
              });

            expect(
              result
            ).toEqual({
              success:
                false,

              duplicate:
                false,

              outboundMessageId:
                "outbound-msg-1",

              code:
                "TWILIO_SMS_FAILED",

              message:
                "Twilio network error",
            });

            expect(
              mocks.updateMany
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                where: {
                  id:
                    "outbound-msg-1",

                  status:
                    OutboundMessageStatus.PROCESSING,
                },

                data:
                  expect.objectContaining({
                    status:
                      OutboundMessageStatus.FAILED,

                    errorCode:
                      "TWILIO_SMS_FAILED",
                  }),
              })
            );
          }
        );
      }
    );

    //------------------------------------------------
    // WhatsApp Dispatch
    //------------------------------------------------

    describe(
      "dispatchCommunicationWhatsApp",
      () => {
        it(
          "resolves WhatsApp adapter dynamically from registry and dispatches approved template",
          async () => {
            const mockSend =
              vi.fn().mockResolvedValue({
                success:
                  true,

                provider:
                  "META",

                channel:
                  "WHATSAPP",

                providerMessageId:
                  "wamid.123",

                status:
                  "accepted",
              });

            mocks.resolveMessagingProvider.mockReturnValue({
              provider:
                "META",

              channels: [
                "WHATSAPP",
              ],

              capabilities: [
                "WHATSAPP_OUTBOUND",
                "WHATSAPP_TEMPLATE",
              ],

              isConfigured:
                () => true,

              send:
                mockSend,
            });

            const result =
              await dispatchCommunicationWhatsApp({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Bob",
              });

            expect(
              mocks.resolveMessagingProvider
            ).toHaveBeenCalledWith({
              channel:
                "WHATSAPP",

              capability:
                "WHATSAPP_OUTBOUND",
            });

            expect(
              mocks.create
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                data:
                  expect.objectContaining({
                    channel:
                      MessagingChannel.WHATSAPP,

                    provider:
                      "META",

                    recipient:
                      "+15551234567",
                  }),
              })
            );

            expect(
              mockSend
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                channel:
                  "WHATSAPP",

                recipient:
                  "+15551234567",

                templateName:
                  "lead_follow_up",

                templateLanguage:
                  "en_US",
              })
            );

            expect(
              result
            ).toEqual({
              success:
                true,

              duplicate:
                false,

              outboundMessageId:
                "outbound-msg-1",

              code:
                null,

              message:
                null,
            });
          }
        );

        it(
          "blocks dispatch when WhatsApp deployment is disabled",
          async () => {
            mocks.isWhatsAppDeploymentEnabled.mockReturnValueOnce(
              false
            );

            const result =
              await dispatchCommunicationWhatsApp({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Bob",
              });

            expect(
              result
            ).toEqual({
              success:
                false,

              duplicate:
                false,

              outboundMessageId:
                null,

              code:
                "WHATSAPP_PROVIDER_DISABLED",

              message:
                "WhatsApp is not enabled for this deployment.",
            });

            expect(
              mocks.resolveMessagingProvider
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "fails safely when no WhatsApp provider is configured",
          async () => {
            mocks.resolveMessagingProvider.mockReturnValue(
              null
            );

            const result =
              await dispatchCommunicationWhatsApp({
                campaignId:
                  "camp-1",

                recipientId:
                  "rec-1",

                recipient:
                  "+15551234567",

                customerName:
                  "Bob",
              });

            expect(
              result
            ).toEqual({
              success:
                false,

              duplicate:
                false,

              outboundMessageId:
                null,

              code:
                "WHATSAPP_PROVIDER_NOT_CONFIGURED",

              message:
                "No configured WhatsApp messaging provider is available.",
            });
          }
        );
      }
    );
  }
);
