"use client";

import type {
  ColumnDef,
} from "@tanstack/react-table";

import type {
  ContactDTO,
} from "@/features/contacts/contact.types";

import StatusBadge from "./status-badge";
import LanguageBadge from "./language-badge";
import ContactActions from "./contact-actions";

export const columns: ColumnDef<ContactDTO>[] = [
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

    cell: ({ row }) =>
      row.original.email ??
      "Not provided",
  },

  {
    accessorKey: "language",
    header: "Language",

    cell: ({ row }) => (
      <LanguageBadge
        language={row.original.language}
      />
    ),
  },

  {
    accessorKey: "status",
    header: "Status",

    cell: ({ row }) => (
      <StatusBadge
        status={row.original.status}
      />
    ),
  },

  {
    accessorKey: "createdAt",
    header: "Created",

    cell: ({ row }) =>
      new Date(
        row.original.createdAt
      ).toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      ),
  },

  {
    id: "actions",
    header: "Actions",

    cell: ({ row }) => (
      <ContactActions
        contact={row.original}
      />
    ),
  },
];