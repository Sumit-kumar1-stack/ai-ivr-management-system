"use client";

import {
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Input,
} from "@/components/ui/input";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  useCreateCampaign,
} from "@/features/campaigns/use-create-campaign";

export default function CreateCampaignDialog() {
  const [
    open,
    setOpen,
  ] =
    useState(
      false
    );

  const [
    name,
    setName,
  ] =
    useState(
      ""
    );

  const [
    description,
    setDescription,
  ] =
    useState(
      ""
    );

  const [
    language,
    setLanguage,
  ] =
    useState(
      "English"
    );

  const [
    voice,
    setVoice,
  ] =
    useState(
      "Female"
    );

  const createCampaign =
    useCreateCampaign();

  //----------------------------------------------
  // Create Campaign
  //----------------------------------------------

  function handleCreate() {
    const normalizedName =
      name.trim();

    if (
      !normalizedName ||
      createCampaign.isPending
    ) {
      return;
    }

    createCampaign.mutate(
      {
        name:
          normalizedName,

        description:
          description.trim(),

        language:
          language.trim() ||
          "English",

        voice:
          voice.trim() ||
          "Female",

        purpose:
          "GENERAL",

        scheduledAt:
          null,
      },
      {
        onSuccess: () => {
          setName(
            ""
          );

          setDescription(
            ""
          );

          setLanguage(
            "English"
          );

          setVoice(
            "Female"
          );

          setOpen(
            false
          );
        },
      }
    );
  }

  //----------------------------------------------
  // Dialog State
  //----------------------------------------------

  function handleOpenChange(
    nextOpen:
      boolean
  ) {
    if (
      createCampaign.isPending
    ) {
      return;
    }

    setOpen(
      nextOpen
    );
  }

  //----------------------------------------------
  // UI
  //----------------------------------------------

  return (
    <>
      <Button
        onClick={() =>
          setOpen(
            true
          )
        }
      >
        Create Campaign
      </Button>

      <Dialog
        open={open}
        onOpenChange={
          handleOpenChange
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create Campaign
            </DialogTitle>
          </DialogHeader>

          <div
            className="space-y-4"
          >
            <Input
              placeholder="Campaign Name"
              value={name}
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setName(
                  event.target.value
                )
              }
            />

            <Textarea
              placeholder="Description"
              value={
                description
              }
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setDescription(
                  event.target.value
                )
              }
            />

            <Input
              placeholder="Language"
              value={
                language
              }
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setLanguage(
                  event.target.value
                )
              }
            />

            <Input
              placeholder="Voice"
              value={
                voice
              }
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setVoice(
                  event.target.value
                )
              }
            />

            <div
              className="flex gap-2"
            >
              <Button
                className="flex-1"
                onClick={
                  handleCreate
                }
                disabled={
                  createCampaign.isPending ||
                  !name.trim()
                }
              >
                {createCampaign.isPending
                  ? "Creating..."
                  : "Create"}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                disabled={
                  createCampaign.isPending
                }
                onClick={() =>
                  setOpen(
                    false
                  )
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}