"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

import { useKnowledge } from "@/features/knowledge/use-knowledge";

export default function KnowledgeTable() {
  const [search, setSearch] = useState("");

  const {
    data,
    isLoading,
  } = useKnowledge(search);

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">

        <div className="text-5xl">
          📄
        </div>

        <h2 className="text-xl font-semibold mt-4">
          No documents uploaded
        </h2>

        <p className="text-gray-500 mt-2">
          Upload your first knowledge document.
        </p>

      </div>
    );
  }

  return (
    <div className="space-y-4">

      <Input
        placeholder="Search documents..."
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
      />

      <table className="w-full border rounded-lg">

        <thead>

          <tr className="border-b bg-gray-100">

            <th className="p-3 text-left">
              Name
            </th>

            <th className="p-3 text-left">
              Type
            </th>

            <th className="p-3 text-left">
              Chunks
            </th>

            <th className="p-3 text-left">
              Size
            </th>

            <th className="p-3 text-left">
              Uploaded
            </th>

            <th className="p-3 text-left">
              Preview
            </th>

          </tr>

        </thead>

        <tbody>

          {data.map((doc: any) => (

            <tr
              key={doc.id}
              className="border-b hover:bg-gray-50"
            >

              <td className="p-3">
                {doc.originalName}
              </td>

              <td className="p-3">
                {doc.mimeType}
              </td>

              <td className="p-3">
                {doc.chunks.length}
              </td>

              <td className="p-3">
                {(doc.size / 1024).toFixed(1)} KB
              </td>

              <td className="p-3">
                {new Date(
                  doc.uploadedAt
                ).toLocaleString()}
              </td>

              <td className="p-3">

                <a
                  href={doc.path}
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  View
                </a>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}