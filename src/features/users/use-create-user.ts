"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: any) => {
      const { data } = await api.post("/users", body);
      return data;
    },

    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      });
    },
  });
}