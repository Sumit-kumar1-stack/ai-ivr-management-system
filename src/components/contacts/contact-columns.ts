"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ContactDTO } from "@/features/contacts/contact.types";

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
  },
  {
    accessorKey: "language",
    header: "Language",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleDateString(),
  },
];