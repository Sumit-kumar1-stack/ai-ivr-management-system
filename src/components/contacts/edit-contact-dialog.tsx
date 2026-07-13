"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useUpdateContact } from "@/features/contacts/use-update-contact";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  contact: {
    id: string;
    fullName: string;
    phone: string;
    email: string;
    language: string;
  };
}

export default function EditContactDialog({
  open,
  onOpenChange,
  contact,
}: Props) {
  const update = useUpdateContact();

  const [fullName, setFullName] = useState(contact.fullName);
  const [phone, setPhone] = useState(contact.phone);
  const [email, setEmail] = useState(contact.email);
  const [language, setLanguage] = useState(contact.language);

  useEffect(() => {
    setFullName(contact.fullName);
    setPhone(contact.phone);
    setEmail(contact.email);
    setLanguage(contact.language);
  }, [contact]);

  function save() {
    update.mutate(
      {
        id: contact.id,
        fullName,
        phone,
        email,
        language,
      },
      {
        onSuccess() {
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>

        <DialogHeader>

          <DialogTitle>

            Edit Contact

          </DialogTitle>

        </DialogHeader>

        <div className="space-y-4">

          <Input
            value={fullName}
            onChange={(e) =>
              setFullName(e.target.value)
            }
          />

          <Input
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
          />

          <Input
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />

          <Input
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value)
            }
          />

<Button
className="w-full"
disabled={update.isPending}
onClick={save}
>
        {update.isPending
  ? "Saving..."
  : "Save Changes"}
          </Button>

        </div>

      </DialogContent>
    </Dialog>
  );
}