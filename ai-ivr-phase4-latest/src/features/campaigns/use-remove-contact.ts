"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

import {
  toast,
} from "sonner";

interface RemoveContactInput {
  campaignId: string;
  contactId: string;
}

export function useRemoveContact() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      contactId,
    }: RemoveContactInput) => {
      const {
        data,
      } =
        await api.delete(
          `/campaigns/${campaignId}/contacts/${contactId}`
        );

      return data;
    },

    onSuccess: async (
      _result,
      variables
    ) => {
      toast.success(
        "Contact removed"
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "campaigns",
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            "campaign",
            variables.campaignId,
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            "campaign-contacts",
            variables.campaignId,
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            "campaign-stats",
            variables.campaignId,
          ],
        }),
      ]);
    },

    onError: (
      error: unknown
    ) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove contact";

      toast.error(
        message
      );
    },
  });
}