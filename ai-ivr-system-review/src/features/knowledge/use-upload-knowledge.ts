"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export function useUploadKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();

      formData.append("file", file);

      const { data } = await api.post(
  "/knowledge/upload",
  formData,
  {
    headers: {
      "Content-Type":
        "multipart/form-data",
    },

    onUploadProgress(event) {

      const percent =
        Math.round(
          (event.loaded * 100) /
            (event.total || 1)
        );

      console.log(percent);
    },
  }
);

      return data;
    },

    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["knowledge"],
      });
    },
  });
}