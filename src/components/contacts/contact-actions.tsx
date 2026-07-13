"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import EditContactDialog from "./edit-contact-dialog";
import DeleteContactDialog from "./delete-contact-dialog";
import type { ContactDTO } from "@/features/contacts/contact.types";

interface Props {
  contact: ContactDTO;
}

export default function ContactActions({
  contact,
}: Props) {
  const [editOpen, setEditOpen] =
    useState(false);

  const [deleteOpen, setDeleteOpen] =
    useState(false);

  return (
    <>
      <div className="flex gap-2">

        <Button
          size="sm"
          onClick={() => setEditOpen(true)}
        >
          Edit
        </Button>

        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>

      </div>


      <EditContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={{
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          email: contact.email ?? "",
          language: contact.language,
        }}
      />


      <DeleteContactDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        id={contact.id}
      />
    </>
  );
}