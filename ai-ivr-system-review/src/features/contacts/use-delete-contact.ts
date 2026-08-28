"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(
        `/contacts/${id}`
      );

      return data;
    },

    onSuccess() {
      toast.success("Contact deleted");

      queryClient.invalidateQueries({
        queryKey: ["contacts"],
      });
    },

    onError() {
      toast.error("Failed to delete contact");
    },
  });
}