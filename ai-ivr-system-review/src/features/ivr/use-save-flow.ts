"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  toast,
} from "sonner";

import type {
  IVREdge,
  IVRNode,
} from "@/components/ivr/types";

import {
  api,
} from "@/lib/axios";

//--------------------------------------------------
// Save
//--------------------------------------------------

export function useSaveFlow() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      async (
        payload: {
          name:
            string;

          description?:
            string;

          campaignId?:
            string;

          nodes:
            IVRNode[];

          edges:
            IVREdge[];
        }
      ) => {
        const {
          data,
        } =
          await api.post(
            "/ivr-flows",
            payload
          );

        return data.data;
      },

    onSuccess(
      flow
    ) {
      toast.success(
        "Flow saved successfully"
      );

      queryClient.invalidateQueries({
        queryKey: [
          "ivr-flows",
        ],
      });

      if (
        flow?.id
      ) {
        queryClient.invalidateQueries({
          queryKey: [
            "ivr-flow",
            flow.id,
          ],
        });
      }
    },

    onError() {
      toast.error(
        "Failed to save flow"
      );
    },
  });
}