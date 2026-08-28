"use client";

import { Button } from "@/components/ui/button";

interface Props {
  loading: boolean;
  disabled?: boolean;
  onSave: () => void;
}

export default function SaveFlowButton({
  loading,
  disabled = false,
  onSave,
}: Props) {
  return (
    <Button
      onClick={onSave}
      disabled={loading || disabled}
    >
      {loading
        ? "Saving..."
        : "Save Flow"}
    </Button>
  );
}
