"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useUploadKnowledge() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();

      form.append("file", file);

      const { data } = await api.post(
        "/knowledge/upload",
        form
      );

      return data;
    },
  });
}