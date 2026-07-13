"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/axios";

import { toast } from "sonner";

export function useCreateCampaign() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: async (
      campaign: any
    ) => {
      const { data } =
        await api.post(
          "/campaigns",
          campaign
        );

      return data;
    },

    onSuccess() {
      toast.success(
        "Campaign created successfully"
      );

      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      });
    },

    onError(error: any) {
      toast.error(
        error?.response?.data?.message ??
          "Failed to create campaign"
      );
    },
  });
}