"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useCampaignStats(
  campaignId: string
) {
  return useQuery({
    queryKey: [
      "campaign-stats",
      campaignId,
    ],

    queryFn: async () => {
      const { data } =
        await api.get(
          `/campaigns/${campaignId}/stats`
        );

      return data.data;
    },

    enabled: !!campaignId,
  });
}