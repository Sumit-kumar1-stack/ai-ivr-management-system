"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: any) => {
      const { data } = await api.post(
        "/campaigns",
        campaign
      );

      return data.data;
    },

    onSuccess() {
      toast.success("Campaign created");

      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      });
    },

    onError() {
      toast.error("Failed to create campaign");
    },
  });
}