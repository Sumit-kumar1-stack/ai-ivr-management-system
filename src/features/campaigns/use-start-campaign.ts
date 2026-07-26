"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  AxiosError,
} from "axios";

import {
  toast,
} from "sonner";

import {
  api,
} from "@/lib/axios";

interface StartCampaignResponse {
  success: boolean;
  message: string;

  data: {
    campaignId: string;
    campaignRunId: string;
    status: string;
    total: number;
  };
}

interface ErrorResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export function useStartCampaign() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      async (
        campaignId: string
      ): Promise<StartCampaignResponse["data"]> => {
        const {
          data,
        } =
          await api.post<StartCampaignResponse>(
            `/campaigns/${campaignId}/start`
          );

        return data.data;
      },

    onSuccess:
      async (
        result,
        campaignId
      ) => {
        toast.success(
          `Campaign queued with ${result.total} contact${
            result.total === 1
              ? ""
              : "s"
          }`
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
              campaignId,
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "campaign-stats",
              campaignId,
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "campaign-contacts",
              campaignId,
            ],
          }),
        ]);
      },

    onError: (
      error: unknown
    ) => {
      const message =
        getStartCampaignErrorMessage(
          error
        );

      toast.error(
        message
      );
    },
  });
}

function getStartCampaignErrorMessage(
  error: unknown
): string {
  if (
    error instanceof
    AxiosError
  ) {
    const responseData =
      error.response
        ?.data as
        | ErrorResponse
        | undefined;

    return (
      responseData?.message ??
      responseData?.error ??
      "Failed to start campaign"
    );
  }

  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return "Failed to start campaign";
}