"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

type UpdateUserInput =
  Record<
    string,
    unknown
  >;

interface UpdateUserVariables {
  id: string;

  body:
    UpdateUserInput;
}

export function useUpdateUser() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      async ({
        id,
        body,
      }: UpdateUserVariables) => {
        const {
          data,
        } =
          await api.put(
            `/users/${id}`,
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