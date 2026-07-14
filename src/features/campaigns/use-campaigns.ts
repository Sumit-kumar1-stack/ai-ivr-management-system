"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

// Fetch all campaigns
export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],

    queryFn: async () => {
      const { data } = await api.get("/campaigns");
      return data.data;
    },
  });
}

// Fetch single campaign
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