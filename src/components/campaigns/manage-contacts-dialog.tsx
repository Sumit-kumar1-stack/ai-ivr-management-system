"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useDebounce } from "@/hooks/use-debounce";

import AvailableContactTable from "./available-contact-table";

import { useContacts } from "@/features/contacts/use-contacts";
import { useAssignContacts } from "@/features/campaigns/use-assign-contacts";

interface Props {
  campaignId: string;
}

export default function ManageContactsDialog({
  campaignId,
}: Props) {
  const [open, setOpen] = useState(false);

  const [search, setSearch] = useState("");

  const debounced = useDebounce(search);

  const [selected, setSelected] = useState<string[]>([]);

  const {
    data,
    isLoading,
    error,
  } = useContacts({
    page: 1,
    limit: 100,
  });

  const assign = useAssignContacts();

  const contacts = data?.data ?? [];

  const filtered = useMemo(() => {
    return contacts.filter((contact: any) =>
      contact.fullName
        .toLowerCase()
        .includes(debounced.toLowerCase())
    );
  }, [contacts, debounced]);

  function toggleSelection(id: string) {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((x) => x !== id)
        : [...previous, id]
    );
  }

  function handleAssign() {
    if (selected.length === 0) return;

    assign.mutate(
      {
        campaignId,
        contactIds: selected,
      },
      {
        onSuccess() {
          setSelected([]);
          setSearch("");
          setOpen(false);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
<Button
  onClick={() => setOpen(true)}
>
  Manage Contacts
</Button>

      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Assign Contacts
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        {isLoading ? (
          <div className="py-10 text-center text-gray-500">
            Loading contacts...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-600">
            Failed to load data.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold">
              No Contacts Found
            </h3>

            <p className="mt-2 text-gray-500">
              Try a different search or import contacts first.
            </p>
          </div>
        ) : (
          <AvailableContactTable
            contacts={filtered}
            selected={selected}
            toggleSelection={toggleSelection}
          />
        )}

        <div className="flex justify-end">
          <Button
            disabled={
              assign.isPending ||
              selected.length === 0
            }
            onClick={handleAssign}
          >
            {assign.isPending
              ? "Assigning..."
              : `Assign Selected (${selected.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}