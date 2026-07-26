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

interface AssignCampaignContactsInput {
  campaignId: string;
  contactIds: string[];
}

export interface AssignCampaignContactsResult {
  assigned: number;
  duplicates: number;
  total: number;
}

interface AssignCampaignContactsResponse {
  success: boolean;
  message: string;
  data: AssignCampaignContactsResult;
}

export function useAssignCampaignContacts() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: AssignCampaignContactsInput): Promise<AssignCampaignContactsResult> => {
      const {
        data,
      } =
        await api.post<AssignCampaignContactsResponse>(
          `/campaigns/${campaignId}/contacts`,
          {
            contactIds,
          }
        );

      return data.data;
    },

    onSuccess: async (
      result,
      variables
    ) => {
      toast.success(
        `${result.assigned} contact${
          result.assigned === 1
            ? ""
            : "s"
        } assigned`
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