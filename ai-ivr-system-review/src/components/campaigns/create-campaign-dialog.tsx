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
    prompt,
    setPrompt,
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

  const [
    purpose,
    setPurpose,
  ] =
    useState<
      "GENERAL" | "REMINDER" | "CALLBACK" | "FOLLOW_UP"
    >(
      "GENERAL"
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

        prompt:
          prompt.trim(),

        language:
          language.trim() ||
          "English",

        voice:
          voice.trim() ||
          "Female",

        purpose:
          purpose,

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

          setPrompt(
            ""
          );

          setLanguage(
            "English"
          );

          setVoice(
            "Female"
          );

          setPurpose(
            "GENERAL"
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
        variant="outline"
        onClick={() =>
          setOpen(
            true
          )
        }
      >
        Quick Test Call
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
              Quick Test Call
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-slate-500">
            Internal/Test only. This keeps the lightweight test flow separate
            from production campaign creation.
          </p>

          <div
            className="space-y-4"
          >
            <Input
              placeholder="Test label"
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
              placeholder="Temporary opening message"
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

            <Textarea
              placeholder="Temporary instructions"
              value={
                prompt
              }
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setPrompt(
                  event.target.value
                )
              }
            />

            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={
                purpose
              }
              disabled={
                createCampaign.isPending
              }
              onChange={event =>
                setPurpose(
                  event.target.value as
                    | "GENERAL"
                    | "REMINDER"
                    | "CALLBACK"
                    | "FOLLOW_UP"
                )
              }
            >
              <option value="GENERAL">
                Internal demo
              </option>
              <option value="REMINDER">
                Reminder test
              </option>
              <option value="CALLBACK">
                Callback test
              </option>
              <option value="FOLLOW_UP">
                Follow-up test
              </option>
            </select>

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
              placeholder="Voice runtime / voice"
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
                  ? "Preparing..."
                  : "Start Test"}
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
