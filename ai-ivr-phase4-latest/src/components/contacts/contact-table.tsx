"use client";

import {
  useMemo,
} from "react";

import {
  AlertCircle,
  ContactRound,
} from "lucide-react";

import type {
  ColumnDef,
} from "@tanstack/react-table";

import type {
  ContactDTO,
} from "@/features/contacts/contact.types";

import {
  DataTable,
} from "@/components/ui/data-table/data-table";

import TableSkeleton from "@/components/ui/table-skeleton";

import {
  columns as contactColumns,
} from "./contact-columns";

interface ContactTableProps {
  contacts: ContactDTO[];
  selectedContactIds: string[];
  isLoading?: boolean;
  isError?: boolean;

  onSelectionChange: (
    contactIds: string[]
  ) => void;
}

export default function ContactTable({
  contacts,
  selectedContactIds,
  isLoading = false,
  isError = false,
  onSelectionChange,
}: ContactTableProps) {
  const allCurrentPageSelected =
    contacts.length > 0 &&
    contacts.every((contact) =>
      selectedContactIds.includes(
        contact.id
      )
    );

  const someCurrentPageSelected =
    contacts.some((contact) =>
      selectedContactIds.includes(
        contact.id
      )
    );

  function toggleContact(
    contactId: string
  ): void {
    const isSelected =
      selectedContactIds.includes(
        contactId
      );

    if (isSelected) {
      onSelectionChange(
        selectedContactIds.filter(
          (id) =>
            id !== contactId
        )
      );

      return;
    }

    onSelectionChange([
      ...selectedContactIds,
      contactId,
    ]);
  }

  function toggleCurrentPage(): void {
    const currentPageIds =
      contacts.map(
        (contact) =>
          contact.id
      );

    if (
      allCurrentPageSelected
    ) {
      onSelectionChange(
        selectedContactIds.filter(
          (id) =>
            !currentPageIds.includes(
              id
            )
        )
      );

      return;
    }

    onSelectionChange(
      Array.from(
        new Set([
          ...selectedContactIds,
          ...currentPageIds,
        ])
      )
    );
  }

  const columns =
    useMemo<
      ColumnDef<ContactDTO>[]
    >(
      () => [
        {
          id: "select",

          header: () => (
            <input
              type="checkbox"
              checked={
                allCurrentPageSelected
              }
              ref={(element) => {
                if (element) {
                  element.indeterminate =
                    !allCurrentPageSelected &&
                    someCurrentPageSelected;
                }
              }}
              onChange={
                toggleCurrentPage
              }
              aria-label="Select all contacts on this page"
              className="
                h-4
                w-4
                cursor-pointer
                accent-primary
              "
            />
          ),

          cell: ({ row }) => {
            const contact =
              row.original;

            return (
              <input
                type="checkbox"
                checked={
                  selectedContactIds.includes(
                    contact.id
                  )
                }
                onChange={() =>
                  toggleContact(
                    contact.id
                  )
                }
                aria-label={`Select ${contact.fullName}`}
                className="
                  h-4
                  w-4
                  cursor-pointer
                  accent-primary
                "
              />
            );
          },
        },

        ...contactColumns,
      ],
      [
        allCurrentPageSelected,
        someCurrentPageSelected,
        selectedContactIds,
        contacts,
      ]
    );

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (isError) {
    return (
      <div
        className="
          flex
          min-h-52
          flex-col
          items-center
          justify-center
          rounded-xl
          border
          border-destructive/30
          bg-destructive/5
          p-8
          text-center
        "
      >
        <AlertCircle
          className="
            mb-3
            h-9
            w-9
            text-destructive
          "
        />

        <h3 className="font-semibold">
          Unable to load contacts
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Refresh the page or try again.
        </p>
      </div>
    );
  }

  if (
    contacts.length === 0
  ) {
    return (
      <div
        className="
          flex
          min-h-52
          flex-col
          items-center
          justify-center
          rounded-xl
          border
          border-dashed
          p-8
          text-center
        "
      >
        <ContactRound
          className="
            mb-3
            h-10
            w-10
            text-muted-foreground
          "
        />

        <h3 className="font-semibold">
          No contacts found
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Change the filters or add a new contact.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={contacts}
    />
  );
}