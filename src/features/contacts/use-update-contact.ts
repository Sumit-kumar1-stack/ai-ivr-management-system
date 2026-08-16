"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import type { UpdateContactInput } from "./contact.schema";

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...contact
    }: {
      id: string;
    } & UpdateContactInput) => {
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