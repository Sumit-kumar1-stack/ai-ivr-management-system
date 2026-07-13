"use client";

import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/axios";

export function useStartCampaign() {
  return useMutation({
    mutationFn: async (
      campaignId: string
    ) => {
      const { data } = await api.post(
        `/campaigns/${campaignId}/start`
      );

      return data;
    },
  });
}