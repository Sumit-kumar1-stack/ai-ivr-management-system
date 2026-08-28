"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useCampaignContacts(
  campaignId: string
) {
  return useQuery({
    queryKey: [
      "campaign-contacts",
      campaignId,
    ],
queryFn: async () => {
    const response = await api.get(
        `/campaigns/${campaignId}/contacts`
    );

    return response.data.data;
},


    enabled: !!campaignId,
  });
}