"use client";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

export interface ContactStatistics {
  total: number;
  pending: number;
  called: number;
  failed: number;
  answered: number;
  blocked: number;
}

interface ContactStatisticsResponse {
  success: boolean;
  message: string;
  data: ContactStatistics;
}

export function useContactStats() {
  return useQuery({
    queryKey: [
      "contact-stats",
    ],

    queryFn:
      async (): Promise<ContactStatistics> => {
        const {
          data,
        } =
          await api.get<ContactStatisticsResponse>(
            "/contacts/stats"
          );

        return data.data;
      },

    staleTime:
      15_000,

    refetchOnWindowFocus:
      true,
  });
}