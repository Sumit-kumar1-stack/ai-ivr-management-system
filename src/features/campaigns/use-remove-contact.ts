"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      contactId,
    }: {
      campaignId: string;
      contactId: string;
    }) => {
      const { data } = await api.delete(
        `/campaigns/${campaignId}/contacts/${contactId}`
      );

      return data;
    },

    onSuccess: (_, variables) => {
      toast.success("Contact removed");

      queryClient.invalidateQueries({
        queryKey: [
          "campaign-contacts",
          variables.campaignId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "campaign-stats",
          variables.campaignId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "campaigns",
        ],
      });
    },

    onError: (error: any) => {
      toast.error(
        error?.message || "Failed to remove contact"
      );
    },
  });
}