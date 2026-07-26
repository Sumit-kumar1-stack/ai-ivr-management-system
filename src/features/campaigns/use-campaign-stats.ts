"use client";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

//--------------------------------------------------
// Shared Metric Types
//--------------------------------------------------

export interface CampaignAttemptMetrics {
  total: number;

  initial: number;

  retries: number;

  active: number;

  queued: number;

  ringing: number;

  currentlyAnswered: number;

  answered: number;

  completed: number;

  unsuccessful: number;

  failed: number;

  busy: number;

  noAnswer: number;

  canceled: number;
}

export interface HistoricalAttemptMetrics {
  total: number;

  answered: number;

  completed: number;

  unsuccessful: number;

  failed: number;

  busy: number;

  noAnswer: number;

  canceled: number;
}

//--------------------------------------------------
// Campaign Statistics DTO
//--------------------------------------------------

export interface CampaignStatsDTO {
  campaign: {
    id: string;

    name: string;

    description:
      | string
      | null;

    language: string;

    voice: string;

    status: string;

    scheduledAt:
      | string
      | null;

    startedAt:
      | string
      | null;

    completedAt:
      | string
      | null;

    createdAt: string;

    updatedAt: string;
  };

  contacts: {
    assigned: number;

    processed: number;

    attempted: number;

    notAttempted: number;

    completed: number;

    active: number;

    awaitingRetry: number;

    unsuccessful: number;

    dispatchFailed: number;

    totalUnsuccessful: number;

    accounted: number;

    coverageRate: number;
  };

  dispatch: {
    total: number;

    processed: number;

    accepted: number;

    failed: number;

    remaining: number;
  };

  latestRun:
    | {
        id: string;

        status: string;

        total: number;

        processed: number;

        successful: number;

        failed: number;

        remaining: number;

        progressPercentage: number;

        startedAt:
          | string
          | null;

        completedAt:
          | string
          | null;

        createdAt: string;

        updatedAt: string;
      }
    | null;

  currentRunAttempts:
    CampaignAttemptMetrics;

  currentRunCalls:
    CampaignAttemptMetrics;

  historicalAttempts:
    HistoricalAttemptMetrics;

  historicalCalls:
    HistoricalAttemptMetrics;

  rates: {
    contactCoverageRate: number;

    contactCompletionRate: number;

    contactUnsuccessfulRate: number;

    attemptAnswerRate: number;

    attemptCompletionRate: number;

    attemptUnsuccessfulRate: number;

    answerRate: number;

    completionRate: number;

    unsuccessfulRate: number;
  };

  duration: {
    totalSeconds: number;

    averageSeconds: number;

    minimumSeconds: number;

    maximumSeconds: number;
  };

  lifecycle: {
    firstRequestedAt:
      | string
      | null;

    lastRequestedAt:
      | string
      | null;

    firstQueuedAt:
      | string
      | null;

    lastQueuedAt:
      | string
      | null;

    firstRingingAt:
      | string
      | null;

    lastRingingAt:
      | string
      | null;

    firstAnsweredAt:
      | string
      | null;

    lastAnsweredAt:
      | string
      | null;

    firstCompletedAt:
      | string
      | null;

    lastCompletedAt:
      | string
      | null;
  };

  historicalDuration: {
    totalSeconds: number;

    averageSeconds: number;

    minimumSeconds: number;

    maximumSeconds: number;
  };
}

//--------------------------------------------------
// API Response
//--------------------------------------------------

interface CampaignStatsResponse {
  success: boolean;

  message: string;

  data: CampaignStatsDTO;
}

//--------------------------------------------------
// Hook
//--------------------------------------------------

export function useCampaignStats(
  campaignId: string
) {
  return useQuery({
    queryKey: [
      "campaign-stats",
      campaignId,
    ],

    queryFn:
      async (): Promise<CampaignStatsDTO> => {
        const {
          data,
        } =
          await api.get<CampaignStatsResponse>(
            `/campaigns/${campaignId}/stats`
          );

        return data.data;
      },

    enabled:
      Boolean(
        campaignId
      ),

    /*
     * Campaign calls can change frequently.
     */
    staleTime:
      5_000,

    refetchInterval:
      10_000,
  });
}