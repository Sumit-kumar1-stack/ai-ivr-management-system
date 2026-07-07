"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/axios";

export interface ContactFilters {

    page?: number;

    limit?: number;

    search?: string;

    language?: string;

    status?: string;

}

export function useContacts(

    filters: ContactFilters

) {

    return useQuery({

        queryKey: [

            "contacts",

            filters,

        ],

        queryFn: async () => {

            const { data } =

                await api.get(

                    "/contacts",

                    {

                        params: filters,

                    }

                );

            return data;

        },

    });

}