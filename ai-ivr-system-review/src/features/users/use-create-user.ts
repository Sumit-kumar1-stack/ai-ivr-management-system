"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

type CreateUserInput =
  Record<
    string,
    unknown
  >;

export function useCreateUser() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      async (
        body:
          CreateUserInput
      ) => {
        const {
          data,
        } =
          await api.post(
            "/users",
            body
          );

        return data;
      },

    onSuccess() {
      void queryClient
        .invalidateQueries({
          queryKey: [
            "users",
          ],
        });
    },
  });
}