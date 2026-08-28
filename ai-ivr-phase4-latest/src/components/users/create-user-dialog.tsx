"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CreateUserDialog({
  open,
  onOpenChange,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create User
          </DialogTitle>
        </DialogHeader>

        <p>User Form Coming Next...</p>

      </DialogContent>
    </Dialog>
  );
}