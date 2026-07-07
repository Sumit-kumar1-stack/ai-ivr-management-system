"use client";

import { ColumnDef } from "@tanstack/react-table";

import StatusBadge from "./status-badge";
import LanguageBadge from "./language-badge";
import ContactActions from "./contact-actions";

export interface Contact {

    id: string;

    fullName: string;

    phone: string;

    email: string;

    language: string;

    status: string;

    createdAt: string;

}

export const columns: ColumnDef<Contact>[] = [

    {

        accessorKey: "fullName",

        header: "Name",

    },

    {

        accessorKey: "phone",

        header: "Phone",

    },

    {

        accessorKey: "email",

        header: "Email",

    },

    {

        accessorKey: "language",

        header: "Language",

        cell: ({ row }) => (

            <LanguageBadge

                language={

                    row.original.language

                }

            />

        ),

    },

    {

        accessorKey: "status",

        header: "Status",

        cell: ({ row }) => (

            <StatusBadge

                status={

                    row.original.status

                }

            />

        ),

    },

    {

        accessorKey: "createdAt",

        header: "Created",

        cell: ({ row }) => (

            new Date(

                row.original.createdAt

            ).toLocaleDateString()

        ),

    },

    {

        id: "actions",

        header: "Actions",

        cell: ({ row }) => (

            <ContactActions

                id={

                    row.original.id

                }

            />

        ),

    },

];