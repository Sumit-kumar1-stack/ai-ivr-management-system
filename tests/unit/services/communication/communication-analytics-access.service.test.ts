import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyCommunicationAnalyticsEntitlement,
} from "@/services/communication/communication-analytics-access.service";

import type {
  CommunicationCampaignMetricsDTO,
  CommunicationChannelMixDTO,
} from "@/types/communication-insights";

const metrics:
  CommunicationCampaignMetricsDTO =
{
  sent:
    100,

  delivered:
    90,

  opened:
    70,

  converted:
    12,

  dropped:
    4,

  bounced:
    6,

  unsubscribed:
    3,

  averageTimeToOpenSeconds:
    45,
};

const channelMix:
  CommunicationChannelMixDTO[] =
[
  {
    channel:
      "SMS",

    selected:
      true,

    attempts:
      100,

    successful:
      90,

    failed:
      10,

    successRate:
      90,

    averageDurationSeconds:
      null,
  },

  {
    channel:
      "AI_VOICE",

    selected:
      true,

    attempts:
      20,

    successful:
      16,

    failed:
      4,

    successRate:
      80,

    averageDurationSeconds:
      72,
  },
];

describe(
  "Communication analytics entitlement",
  () => {
    it(
      "returns full advanced analytics for Premium",
      () => {
        const result =
          applyCommunicationAnalyticsEntitlement(
            "PREMIUM",
            metrics,
            channelMix
          );

        expect(
          result.access
        ).toBe(
          "ADVANCED"
        );

        expect(
          result.metrics
        ).toEqual(
          metrics
        );

        expect(
          result.channelMix
        ).toEqual(
          channelMix
        );
      }
    );

    it(
      "keeps Standard operational metrics",
      () => {
        const result =
          applyCommunicationAnalyticsEntitlement(
            "STANDARD",
            metrics,
            channelMix
          );

        expect(
          result.access
        ).toBe(
          "BASIC"
        );

        expect(
          result.metrics.sent
        ).toBe(
          100
        );

        expect(
          result.metrics.delivered
        ).toBe(
          90
        );

        expect(
          result.metrics.opened
        ).toBe(
          70
        );

        expect(
          result.metrics.dropped
        ).toBe(
          4
        );

        expect(
          result.metrics.bounced
        ).toBe(
          6
        );
      }
    );

    it(
      "removes Premium-only attribution metrics from Standard",
      () => {
        const result =
          applyCommunicationAnalyticsEntitlement(
            "STANDARD",
            metrics,
            channelMix
          );

        expect(
          result.metrics.converted
        ).toBe(
          0
        );

        expect(
          result.metrics.unsubscribed
        ).toBe(
          0
        );

        expect(
          result.metrics.averageTimeToOpenSeconds
        ).toBeNull();
      }
    );

    it(
      "removes Premium-only channel optimization metrics from Standard",
      () => {
        const result =
          applyCommunicationAnalyticsEntitlement(
            "STANDARD",
            metrics,
            channelMix
          );

        for (
          const item
          of result.channelMix
        ) {
          expect(
            item.successRate
          ).toBe(
            0
          );

          expect(
            item.averageDurationSeconds
          ).toBeNull();
        }
      }
    );

    it(
      "fails closed to Standard behavior for an unknown tier",
      () => {
        const result =
          applyCommunicationAnalyticsEntitlement(
            "UNKNOWN",
            metrics,
            channelMix
          );

        expect(
          result.access
        ).toBe(
          "BASIC"
        );

        expect(
          result.metrics.converted
        ).toBe(
          0
        );
      }
    );
  }
);