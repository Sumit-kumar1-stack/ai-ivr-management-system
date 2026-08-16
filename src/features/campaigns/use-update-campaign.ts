"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { isAxiosError } from "axios";

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        language?: string;
        voice?: string;
      };
    }) => {
      const response = await api.put(
        `/campaigns/${id}`,
        data
      );

      return response.data.data;
    },

    onSuccess(_, variables) {
      toast.success(
        "Campaign updated successfully"
      );

      queryClient.invalidateQueries({
        queryKey: ["campaigns"],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "campaign",
          variables.id,
        ],
      });
    },

    onError(error: unknown) {
      toast.error(
        isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message ?? "Failed to update campaign"
          : "Failed to update campaign"
      );
    },
  });
}