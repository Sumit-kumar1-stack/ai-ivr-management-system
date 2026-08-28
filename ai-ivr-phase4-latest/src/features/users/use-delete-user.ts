"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useDeleteUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
    },

    onSuccess() {
      qc.invalidateQueries({
        queryKey: ["users"],
      });
    },
  });
}