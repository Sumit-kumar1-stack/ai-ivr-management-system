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

interface AssignContactsInput {
  campaignId: string;
  contactIds: string[];
}

export function useAssignContacts() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: AssignContactsInput) => {
      const {
        data,
      } =
        await api.post(
          `/campaigns/${campaignId}/contacts`,
          {
            contactIds,
          }
        );

      return data;
    },

    onSuccess: async (
      _result,
      variables
    ) => {
      toast.success(
        "Contacts assigned successfully"
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
          : "Failed to assign contacts";

      toast.error(
        message
      );
    },
  });
}