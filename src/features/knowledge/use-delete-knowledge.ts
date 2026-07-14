"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useDeleteKnowledge() {

  const queryClient = useQueryClient();

  return useMutation({

    mutationFn: async (id: string) => {

      await api.delete(`/knowledge/${id}`);

    },

    onSuccess() {

      queryClient.invalidateQueries({
        queryKey: ["knowledge"],
      });

    },

  });

}