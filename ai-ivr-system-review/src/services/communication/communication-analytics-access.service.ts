import {
  canUseAdvancedCommunicationAnalytics,
} from "./communication-entitlement.service";

import type {
  CommunicationCampaignMetricsDTO,
  CommunicationChannelMixDTO,
} from "@/types/communication-insights";

//--------------------------------------------------
// Analytics Access
//--------------------------------------------------

export type CommunicationAnalyticsAccess =
  | "BASIC"
  | "ADVANCED";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationAnalyticsEntitlementResult {
  access:
    CommunicationAnalyticsAccess;

  metrics:
    CommunicationCampaignMetricsDTO;

  channelMix:
    CommunicationChannelMixDTO[];
}

//--------------------------------------------------
// Apply Entitlement
//--------------------------------------------------

export function applyCommunicationAnalyticsEntitlement(
  tier:
    string,

  metrics:
    CommunicationCampaignMetricsDTO,

  channelMix:
    CommunicationChannelMixDTO[]
): CommunicationAnalyticsEntitlementResult {
  const advanced =
    canUseAdvancedCommunicationAnalytics(
      tier
    );

  if (
    advanced
  ) {
    return {
      access:
        "ADVANCED",

      metrics,

      channelMix,
    };
  }

  //------------------------------------------------
  // Standard Analytics
  //
  // Keep operational delivery/health metrics that
  // are part of the Standard plan, but fail closed
  // on Premium attribution/optimization metrics.
  //------------------------------------------------

  return {
    access:
      "BASIC",

    metrics: {
      sent:
        metrics.sent,

      delivered:
        metrics.delivered,

      opened:
        metrics.opened,

      converted:
        0,

      dropped:
        metrics.dropped,

      bounced:
        metrics.bounced,

      unsubscribed:
        0,

      averageTimeToOpenSeconds:
        null,
    },

    channelMix:
      channelMix.map(
        item => ({
          ...item,

          successRate:
            0,

          averageDurationSeconds:
            null,
        })
      ),
  };
}