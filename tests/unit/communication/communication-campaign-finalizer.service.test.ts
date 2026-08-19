import {
  CampaignStatus,
  OutboundMessageStatus,
} from "@prisma/client";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isCommunicationChildCampaignTerminal,
  isCommunicationMessageTerminal,
} from "@/services/communication/communication-campaign-finalizer.service";

describe(
  "communication campaign finalizer terminal contracts",
  () => {
    it(
      "treats only final messaging outcomes as terminal",
      () => {
        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.DELIVERED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.READ
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.FAILED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.UNDELIVERED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.SENT
          )
        ).toBe(
          false
        );

        expect(
          isCommunicationMessageTerminal(
            OutboundMessageStatus.QUEUED
          )
        ).toBe(
          false
        );
      }
    );

    it(
      "treats only completed, failed and cancelled child campaigns as terminal",
      () => {
        expect(
          isCommunicationChildCampaignTerminal(
            CampaignStatus.COMPLETED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationChildCampaignTerminal(
            CampaignStatus.FAILED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationChildCampaignTerminal(
            CampaignStatus.CANCELLED
          )
        ).toBe(
          true
        );

        expect(
          isCommunicationChildCampaignTerminal(
            CampaignStatus.RUNNING
          )
        ).toBe(
          false
        );

        expect(
          isCommunicationChildCampaignTerminal(
            CampaignStatus.QUEUED
          )
        ).toBe(
          false
        );
      }
    );
  }
);
