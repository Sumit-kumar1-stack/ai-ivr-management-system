"use client";

import { Badge } from "@/components/ui/badge";
import type { ContactDTO } from "@/features/contacts/contact.types";

interface Props {
  contacts: ContactDTO[];
  selected: string[];
  toggleSelection: (id: string) => void;
}

export default function AvailableContactTable({
  contacts,
  selected,
  toggleSelection,
}: Props) {
  if (contacts.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        No contacts found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-100">
          <tr className="text-left">
            <th className="p-3 w-12"></th>
            <th className="p-3">Name</th>
            <th className="p-3">Phone</th>
            <th className="p-3">Language</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>

        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className="border-t hover:bg-gray-50"
            >
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={selected.includes(contact.id)}
                  onChange={() =>
                    toggleSelection(contact.id)
                  }
                />
              </td>

              <td className="p-3 font-medium">
                {contact.fullName}
              </td>

              <td className="p-3">
                {contact.phone}
              </td>

              <td className="p-3">
                {contact.language}
              </td>

              <td className="p-3">
                <Badge>
                  {contact.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}