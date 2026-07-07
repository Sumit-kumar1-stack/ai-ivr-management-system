"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useImportContacts() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();

      formData.append("file", file);

      const { data } = await api.post(
        "/contacts/import",
        formData
      );

      return data;
    },
  });
}