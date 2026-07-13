"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onUpload: (file: File) => void;
}

export default function KnowledgeUpload({
  onUpload,
}: Props) {
  return (
    <div>

      <input
        id="knowledge-upload"
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];

          if (file) {
            onUpload(file);
          }
        }}
      />

      <Button
        type="button"
        onClick={() =>
          document
            .getElementById("knowledge-upload")
            ?.click()
        }
      >
        Upload Document
      </Button>

    </div>
  );
}