"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...contact
    }: any) => {
      const { data } = await api.put(
        `/contacts/${id}`,
        contact
      );

      return data;
    },

    onSuccess() {
      toast.success("Contact updated");

      queryClient.invalidateQueries({
        queryKey: ["contacts"],
      });
    },

    onError() {
      toast.error("Failed to update contact");
    },
  });
}