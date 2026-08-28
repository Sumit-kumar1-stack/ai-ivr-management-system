"use client";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

import type {
  ContactDTO,
} from "./contact.types";

export interface ContactFilters {
  page?: number;
  limit?: number;
  search?: string;
  language?: string;
  status?: string;
}

export interface ContactPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ContactsResponse {
  success: boolean;
  message: string;
  data: ContactDTO[];
  meta: ContactPaginationMeta;
}

export function useContacts(
  filters: ContactFilters
) {
  return useQuery({
    queryKey: [
      "contacts",
      filters,
    ],

    queryFn: async (): Promise<ContactsResponse> => {
      const {
        data,
      } =
        await api.get<ContactsResponse>(
          "/contacts",
          {
            params: filters,
          }
        );

      return data;
    },

    placeholderData: (
      previousData
    ) => previousData,

    staleTime: 10_000,
  });
}