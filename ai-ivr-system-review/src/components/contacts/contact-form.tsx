"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateContact } from "@/features/contacts/use-create-contact";

export default function ContactForm() {
  const [open, setOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [language, setLanguage] = useState("English");

  const createContact = useCreateContact();

  function submit() {
    createContact.mutate(
      {
        fullName,
        phone,
        email,
        company,
        language,
      },
      {
        onSuccess() {
          setOpen(false);

          setFullName("");
          setPhone("");
          setEmail("");
          setCompany("");
          setLanguage("English");
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>

<Button
  onClick={() => setOpen(true)}
>
  Add Contact
</Button>

      <DialogContent>

        <DialogHeader>

          <DialogTitle>
            Add Contact
          </DialogTitle>

        </DialogHeader>

        <div className="space-y-4">

          <Input
            placeholder="Full Name"
            value={fullName}
            onChange={(e) =>
              setFullName(e.target.value)
            }
          />

          <Input
            placeholder="Phone Number"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
          />

          <Input
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />

          <Input
            placeholder="Company"
            value={company}
            onChange={(e) =>
              setCompany(e.target.value)
            }
          />

          <Input
            placeholder="Language"
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value)
            }
          />

          <Button
            className="w-full"
            onClick={submit}
            disabled={createContact.isPending}
          >
            {createContact.isPending
              ? "Saving..."
              : "Create Contact"}
          </Button>

        </div>

      </DialogContent>

    </Dialog>
  );
}