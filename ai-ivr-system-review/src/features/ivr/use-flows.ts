"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useFlows() {
  return useQuery({
    queryKey: ["ivr-flows"],

    queryFn: async () => {
      const { data } = await api.get(
        "/ivr-flows"
      );

      return data.data;
    },
  });
}