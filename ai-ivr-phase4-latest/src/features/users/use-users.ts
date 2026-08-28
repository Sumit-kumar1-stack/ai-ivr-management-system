"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { User } from "./user.types";

interface UsersResponse {
  success: boolean;
  message: string;
  data: User[];
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await api.get<UsersResponse>("/users");

      return response.data.data;
    },
  });
}