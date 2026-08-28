"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

export function useImportContacts() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: async (
      file: File
    ) => {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const {
        data,
      } = await api.post(
        "/contacts/import",
        formData
      );

      return data;
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "contacts",
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            "contact-stats",
          ],
        }),
      ]);
    },
  });
}