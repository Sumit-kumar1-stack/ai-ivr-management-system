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
// Payload
//--------------------------------------------------

interface UpdateFlowPayload {
  id:
    string;

  name?:
    string;

  description?:
    string | null;

  campaignId?:
    string | null;

  nodes:
    IVRNode[];

  edges:
    IVREdge[];
}

//--------------------------------------------------
// Hook
//--------------------------------------------------

export function useUpdateFlow() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      async ({
        id,
        ...payload
      }:
        UpdateFlowPayload) => {
        const {
          data,
        } =
          await api.put(
            `/ivr-flows/${id}`,
            payload
          );

        return data.data;
      },

    onSuccess(
      _flow,
      variables
    ) {
      toast.success(
        "Flow updated"
      );

      queryClient.invalidateQueries({
        queryKey: [
          "ivr-flows",
        ],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "ivr-flow",
          variables.id,
        ],
      });
    },

    onError() {
      toast.error(
        "Failed to update flow"
      );
    },
  });
}