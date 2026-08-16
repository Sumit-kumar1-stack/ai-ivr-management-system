"use client";

import type { IVRNode, IVRNodeData } from "../types";
import KnowledgeUpload from "./knowledge-upload";
import KnowledgeList from "./knowledge-list";

interface Props {
  node: IVRNode;
  onChange: <K extends keyof IVRNodeData>(field: K, value: IVRNodeData[K]) => void;
}

export default function AIKnowledge({
  node,
  onChange,
}: Props) {

  const knowledge =
    node.data?.knowledge ?? [];

  function upload(file: File) {

    const newFile = {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
    };

    onChange(
      "knowledge",
      [...knowledge, newFile]
    );
  }

  function remove(id: string) {

    onChange(
      "knowledge",
      knowledge.filter(
        (x) => x.id !== id
      )
    );
  }

  return (
    <div className="space-y-5">

      <h3 className="text-lg font-semibold">
        Knowledge Base
      </h3>

      <KnowledgeUpload
        onUpload={upload}
      />

      <KnowledgeList
        files={knowledge}
        onRemove={remove}
      />

    </div>
  );
}