"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import type { CreateCampaignInput } from "./campaign.schema";

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: CreateCampaignInput) => {
      const { data } = await api.post(
        "/campaigns",
        campaign
      );

      return data.data;
    },

    onSuccess() {
      toast.success("Quick test call prepared");

      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      });
    },

    onError() {
      toast.error("Failed to prepare quick test call");
    },
  });
}
