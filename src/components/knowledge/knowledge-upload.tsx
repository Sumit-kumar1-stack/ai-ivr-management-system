"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { useUploadKnowledge } from "@/features/knowledge/use-upload-knowledge";

export default function KnowledgeUpload() {

  const inputRef =
    useRef<HTMLInputElement>(null);

  const upload =
    useUploadKnowledge();

  const [progress, setProgress] =
  useState(0);

  function openPicker() {
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

      <Button onClick={openPicker}>

        {upload.isPending
          ? "Uploading..."
          : "Upload Document"}

      </Button>
    </>
  );
}