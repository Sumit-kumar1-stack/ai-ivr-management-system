"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: any) => {
      const { data } = await api.post(
        "/contacts",
        contact
      );

      return data;
    },

    onSuccess() {
      toast.success("Contact created successfully");

      queryClient.invalidateQueries({
        queryKey: ["contacts"],
      });
    },

    onError() {
      toast.error("Failed to create contact");
    },
  });
}