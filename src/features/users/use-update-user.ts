"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useUpdateUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: any;
    }) => {
      const { data } = await api.put(
        `/users/${id}`,
        body
      );

      return data;
    },

    onSuccess() {
      qc.invalidateQueries({
        queryKey: ["users"],
      });
    },
  });
}