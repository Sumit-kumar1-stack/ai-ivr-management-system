"use client";

import { Button } from "@/components/ui/button";

interface Props {
  loading: boolean;
  onSave: () => void;
}

export default function SaveFlowButton({
  loading,
  onSave,
}: Props) {
  return (
    <Button
      onClick={onSave}
      disabled={loading}
    >
      {loading
        ? "Saving..."
        : "Save Flow"}
    </Button>
  );
}