"use client";

import { Button } from "@/components/ui/button";

interface Props {
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };

  onRemove: (id: string) => void;
}

export default function KnowledgeItem({
  file,
  onRemove,
}: Props) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">

      <div>

        <p className="font-medium">
          {file.name}
        </p>

        <p className="text-sm text-gray-500">
          {file.type} • {(file.size / 1024).toFixed(1)} KB
        </p>

      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => onRemove(file.id)}
      >
        Remove
      </Button>

    </div>
  );
}