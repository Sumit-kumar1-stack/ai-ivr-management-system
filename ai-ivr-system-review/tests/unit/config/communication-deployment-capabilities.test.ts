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
  }
);