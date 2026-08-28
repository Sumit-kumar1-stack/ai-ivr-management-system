"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useFlow(id?: string) {
  return useQuery({
    queryKey: ["ivr-flow", id],

    queryFn: async () => {
      const { data } = await api.get(
        `/ivr-flows/${id}`
      );

      return data.data;
    },

    enabled: !!id,
  });
}