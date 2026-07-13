"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { useDeleteContact } from "@/features/contacts/use-delete-contact";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  id: string;
}

export default function DeleteContactDialog({
  open,
  onOpenChange,
  id,
}: Props) {
  const remove = useDeleteContact();

  function deleteContact() {
    remove.mutate(id, {
      onSuccess() {
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>

        <DialogHeader>

          <DialogTitle>

            Delete Contact

          </DialogTitle>

        </DialogHeader>

        <p>

          Are you sure you want to delete this contact?

        </p>

        <div className="flex justify-end gap-3">

          <Button
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Cancel
          </Button>

<Button
variant="destructive"
disabled={remove.isPending}
onClick={deleteContact}
>
{remove.isPending
  ? "Deleting..."
  : "Delete"}
</Button>

        </div>

      </DialogContent>
    </Dialog>
  );
}