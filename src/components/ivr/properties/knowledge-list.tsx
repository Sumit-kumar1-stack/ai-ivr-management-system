"use client";

import KnowledgeItem from "./knowledge-item";

interface Props {
  files: any[];
  onRemove: (id: string) => void;
}

export default function KnowledgeList({
  files,
  onRemove,
}: Props) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
        No knowledge documents added yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <KnowledgeItem
          key={file.id}
          file={file}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}