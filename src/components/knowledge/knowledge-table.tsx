"use client";

import {
  useState,
} from "react";

import {
  Input,
} from "@/components/ui/input";

import {
  useKnowledge,
} from "@/features/knowledge/use-knowledge";

interface KnowledgeDocument {
  id: string;

  originalName: string;

  mimeType: string;

  chunks: unknown[];

  size: number;

  uploadedAt:
    | string
    | Date;

  path: string;
}

export default function KnowledgeTable() {
  const [
    search,
    setSearch,
  ] =
    useState("");

  const {
    data,
    isLoading,
  } =
    useKnowledge(
      search
    );

  if (
    isLoading
  ) {
    return (
      <p>
        Loading...
      </p>
    );
  }

  if (
    !data ||
    data.length ===
      0
  ) {
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

  const documents =
    data as KnowledgeDocument[];

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search documents..."
        value={
          search
        }
        onChange={
          event =>
            setSearch(
              event.target
                .value
            )
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
          {documents.map(
            document => (
              <tr
                key={
                  document.id
                }
                className="border-b hover:bg-gray-50"
              >
                <td className="p-3">
                  {
                    document.originalName
                  }
                </td>

                <td className="p-3">
                  {
                    document.mimeType
                  }
                </td>

                <td className="p-3">
                  {
                    document.chunks
                      .length
                  }
                </td>

                <td className="p-3">
                  {(
                    document.size /
                    1024
                  ).toFixed(
                    1
                  )}{" "}
                  KB
                </td>

                <td className="p-3">
                  {new Date(
                    document.uploadedAt
                  ).toLocaleString()}
                </td>

                <td className="p-3">
                  <a
                    href={
                      document.path
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </a>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}