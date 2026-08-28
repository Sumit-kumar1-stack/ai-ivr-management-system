"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  title: string;
  description: string;

  confirmText?: string;
  cancelText?: string;

  loading?: boolean;

  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,

  title,
  description,

  confirmText = "Confirm",
  cancelText = "Cancel",

  loading = false,

  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>

        <DialogHeader>

          <DialogTitle>

            {title}

          </DialogTitle>

        </DialogHeader>

        <p className="text-gray-500">

          {description}

        </p>

        <DialogFooter>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>

          <Button
            variant="destructive"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading
              ? "Please wait..."
              : confirmText}
          </Button>

        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}