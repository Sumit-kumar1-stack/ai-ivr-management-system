"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/axios";

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

    onError(error: any) {
      toast.error(
        error?.response?.data?.message ??
          "Failed to delete campaign"
      );
    },
  });
}