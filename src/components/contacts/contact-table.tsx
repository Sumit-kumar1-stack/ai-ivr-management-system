"use client";

import { useContacts } from "@/features/contacts/use-contacts";
import { DataTable } from "@/components/ui/data-table/data-table";
import TableSkeleton from "@/components/ui/table-skeleton";
import { columns } from "./contact-columns";

export default function ContactTable() {
  const { data, isLoading } = useContacts({
    page: 1,
    limit: 10,
  });

  if (isLoading) {
    return <TableSkeleton />;
}

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="text-center py-10">
        No contacts found
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data.data}
    />
  );
}