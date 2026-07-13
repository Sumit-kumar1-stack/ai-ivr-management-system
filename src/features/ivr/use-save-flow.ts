"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useSaveFlow() {
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      campaignId?: string;
      nodes: any[];
      edges: any[];
    }) => {
      const { data } = await api.post(
        "/ivr-flows",
        payload
      );

      return data.data;
    },

    onSuccess() {
      toast.success("Flow saved successfully");
    },

    onError() {
      toast.error("Failed to save flow");
    },
  });
}