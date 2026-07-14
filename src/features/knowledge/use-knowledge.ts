"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/axios";

export function useKnowledge(
  search = ""
) {
  return useQuery({

    queryKey: [
      "knowledge",
      search,
    ],

    queryFn: async () => {

      const { data } =
        await api.get(
          `/knowledge?search=${search}`
        );

      return data.data;
    },

  });
}