"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/axios";

import { toast } from "sonner";

interface UpdateFlowPayload {
  id: string;
  nodes: any[];
  edges: any[];
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      nodes,
      edges,
    }: UpdateFlowPayload) => {
      const { data } = await api.put(
        `/ivr-flows/${id}`,
        {
          nodes,
          edges,
        }
      );

      return data.data;
    },

    onSuccess(_, variables) {
      toast.success("Flow updated");

      queryClient.invalidateQueries({
        queryKey: ["ivr-flows"],
      });

      queryClient.invalidateQueries({
        queryKey: ["ivr-flow", variables.id],
      });
    },

    onError() {
      toast.error("Failed to update flow");
    },
  });
}