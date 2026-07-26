"use client";

import {
  FolderPlus,
  X,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

interface ContactBulkActionsProps {
  selectedCount: number;
  onAssignToCampaign: () => void;
  onClearSelection: () => void;
}

export default function ContactBulkActions({
  selectedCount,
  onAssignToCampaign,
  onClearSelection,
}: ContactBulkActionsProps) {
  if (
    selectedCount === 0
  ) {
    return null;
  }

  return (
    <div
      className="
        flex
        flex-col
        gap-3
        rounded-xl
        border
        bg-muted/30
        p-4
        sm:flex-row
        sm:items-center
        sm:justify-between
      "
    >
      <p className="text-sm font-medium">
        {selectedCount}{" "}
        {selectedCount === 1
          ? "contact"
          : "contacts"}{" "}
        selected
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={
            onAssignToCampaign
          }
        >
          <FolderPlus className="mr-2 h-4 w-4" />

          Assign to Campaign
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={
            onClearSelection
          }
        >
          <X className="mr-2 h-4 w-4" />

          Clear
        </Button>
      </div>
    </div>
  );
}