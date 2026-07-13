"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useCreateCampaign } from "@/features/campaigns/use-create-campaign";


export default function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");

  const [description, setDescription] = useState("");

  const [language, setLanguage] =
    useState("English");

  const [voice, setVoice] =
    useState("Female");

  const createCampaign =
    useCreateCampaign();

  async function handleCreate() {
    createCampaign.mutate(
      {
        name,
        description,
        language,
        voice,
      },
      {
        onSuccess() {
          setOpen(false);

          setName("");

          setDescription("");
        },
      }
    );
  }

  return (
    <>
    <CreateCampaignDialog />

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent>

          <DialogHeader>

            <DialogTitle>
              Create Campaign
            </DialogTitle>

          </DialogHeader>

          <div className="space-y-4">

            <Input
              placeholder="Campaign Name"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
            />

            <Textarea
              placeholder="Description"
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
            />

            <Input
              placeholder="Language"
              value={language}
              onChange={(e) =>
                setLanguage(
                  e.target.value
                )
              }
            />

            <Input
              placeholder="Voice"
              value={voice}
              onChange={(e) =>
                setVoice(
                  e.target.value
                )
              }
            />

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={
                createCampaign.isPending
              }
            >
              {createCampaign.isPending
                ? "Creating..."
                : "Create"}
            </Button>

          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}