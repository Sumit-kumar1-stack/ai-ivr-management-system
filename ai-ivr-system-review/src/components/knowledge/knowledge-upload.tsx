"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";

import { useUploadKnowledge } from "@/features/knowledge/use-upload-knowledge";

export default function KnowledgeUpload({
  disabled = false,
}: {
  disabled?: boolean;
}) {

  const inputRef =
    useRef<HTMLInputElement>(null);

  const upload =
    useUploadKnowledge();

  function openPicker() {
    if (disabled) {
      return;
    }

    inputRef.current?.click();
  }

  function handleFile(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      e.target.files?.[0];

    if (!file) return;

    upload.mutate(file);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".pdf,.docx,.txt"
        onChange={handleFile}
      />

        <Button onClick={openPicker} disabled={disabled}>

          {upload.isPending
            ? "Uploading..."
            : "Upload Document"}

      </Button>
    </>
  );
}
