"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useCampaign(campaignId: string) {
  return useQuery({
    queryKey: ["campaign", campaignId],

    queryFn: async () => {
      const { data } = await api.get(
        `/campaigns/${campaignId}`
      );

      return data.data;
    },

    enabled: !!campaignId,
  });
}