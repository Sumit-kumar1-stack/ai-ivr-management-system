import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertCommunicationDeploymentChannelsAvailable,
  getCommunicationDeploymentCapabilities,
  isWhatsAppDeploymentEnabled,
} from "@/config/communication-deployment-capabilities";

describe(
  "communication deployment capabilities",
  () => {
    it(
      "keeps WhatsApp disabled when the flag is absent",
      () => {
        const env:
          NodeJS.ProcessEnv = {
            NODE_ENV:
              "test",
          };

        expect(
          isWhatsAppDeploymentEnabled(
            env
          )
        ).toBe(
          false
        );

        expect(
          getCommunicationDeploymentCapabilities(
            env
          )
            .whatsapp
            .enabled
        ).toBe(
          false
        );
      }
    );

    it(
      "enables WhatsApp only when explicitly set to true",
      () => {
        const env:
          NodeJS.ProcessEnv = {
            NODE_ENV:
              "test",

            WHATSAPP_ENABLED:
              "true",
          };

        expect(
          isWhatsAppDeploymentEnabled(
            env
          )
        ).toBe(
          true
        );

        expect(
          getCommunicationDeploymentCapabilities(
            env
          )
            .whatsapp
            .reason
        ).toBeNull();
      }
    );

    it(
      "rejects WhatsApp channels when the provider is disabled",
      () => {
        expect(
          () =>
            assertCommunicationDeploymentChannelsAvailable(
              [
                "AI_VOICE",
                "WHATSAPP",
              ],
              {
                NODE_ENV:
                  "test",

                WHATSAPP_ENABLED:
                  "false",
              }
            )
        ).toThrow(
          "WHATSAPP_PROVIDER_DISABLED"
        );
      }
    );

    it(
      "allows non-WhatsApp channels while WhatsApp is disabled",
      () => {
        expect(
          () =>
            assertCommunicationDeploymentChannelsAvailable(
              [
                "AI_VOICE",
                "SMS",
              ],
              {
                NODE_ENV:
                  "test",

                WHATSAPP_ENABLED:
                  "false",
              }
            )
        ).not.toThrow();
      }
    );

    it(
      "exposes SMS deployment capabilities with preferred provider",
      () => {
        const env: NodeJS.ProcessEnv = {
          NODE_ENV: "test",
          SMS_PROVIDER: "exotel",
        };

        const capabilities = getCommunicationDeploymentCapabilities(env);
        expect(capabilities.sms).toBeDefined();
        expect(capabilities.sms?.enabled).toBe(true);
        expect(capabilities.sms?.preferredProvider).toBe("EXOTEL");
      }
    );

    it(
      "rejects SMS channels when SMS is explicitly disabled",
      () => {
        expect(
          () =>
            assertCommunicationDeploymentChannelsAvailable(
              [
                "SMS",
              ],
              {
                NODE_ENV: "test",
                SMS_ENABLED: "false",
              }
            )
        ).toThrow(
          "SMS_PROVIDER_DISABLED"
        );
      }
    );
  }
);