"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { isAxiosError } from "axios";

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      campaignId: string
    ) => {
      await api.delete(
        `/campaigns/${campaignId}`
      );
    },

    onSuccess() {
      toast.success(
        "Campaign deleted successfully"
      );

      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      });
    },

    onError(error: unknown) {
      toast.error(
        isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message ?? "Failed to delete campaign"
          : "Failed to delete campaign"
      );
    },
  });
}