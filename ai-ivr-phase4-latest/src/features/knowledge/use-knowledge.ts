"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/axios";
import type { KnowledgeDocumentSummary } from "./knowledge.types";

interface KnowledgeListResponse {
  success: boolean;
  data: KnowledgeDocumentSummary[];
  message?: string;
}

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
          `/knowledge?search=${encodeURIComponent(search)}`
        ) as {
          data: KnowledgeListResponse;
        };

      return data.data ?? [];
    },

  });
}
