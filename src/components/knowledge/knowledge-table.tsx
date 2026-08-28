"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ExternalLink, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/axios";
import { useKnowledge } from "@/features/knowledge/use-knowledge";

interface KnowledgeDocument {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string | Date;
  classification: string;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  chunkCount: number;
  campaignCount: number;
  isIndexed: boolean;
  dependencySummary: {
    campaignCount: number;
    ivrFlowCount: number;
    ivrVersionCount: number;
    publishedIvrVersionCount: number;
    inboundProfileScopeCount: number;
    liveDeploymentCount: number;
    runtimeCallCount: number;
    isReferenced: boolean;
    deleteAllowed: boolean;
    editAllowed: boolean;
    deleteBlockReason: string | null;
  };
  campaignNames?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

interface KnowledgeTableProps {
  canMutate: boolean;
}

export default function KnowledgeTable({ canMutate }: KnowledgeTableProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useKnowledge(search);

  const [editingDocument, setEditingDocument] = useState<KnowledgeDocument | null>(null);
  const [editName, setEditName] = useState("");
  const [editClassification, setEditClassification] = useState("INTERNAL");
  const [savingEdit, setSavingEdit] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<KnowledgeDocument | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refreshKnowledge(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["knowledge"] });
  }

  function openEditDialog(document: KnowledgeDocument): void {
    setEditingDocument(document);
    setEditName(document.originalName);
    setEditClassification(document.classification);
  }

  async function saveMetadata(): Promise<void> {
    if (!editingDocument || savingEdit) {
      return;
    }

    const normalizedName = editName.trim();

    if (!normalizedName) {
      toast.error("Document name is required");
      return;
    }

    try {
      setSavingEdit(true);

      const { data: response } = await api.patch(`/knowledge/${editingDocument.id}`, {
        originalName: normalizedName,
        classification: editClassification,
      });

      if (!response?.success) {
        throw new Error(response?.message ?? "Knowledge document could not be updated");
      }

      toast.success("Knowledge metadata updated");
      setEditingDocument(null);
      await refreshKnowledge();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Knowledge document could not be updated"
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function archiveDocument(): Promise<void> {
    if (!archiveTarget || archiving) {
      return;
    }

    try {
      setArchiving(true);

      const { data: response } = await api.post(`/knowledge/${archiveTarget.id}/archive`);

      if (!response?.success) {
        throw new Error(response?.message ?? "Knowledge document could not be archived");
      }

      toast.success("Knowledge document archived");
      setArchiveTarget(null);
      await refreshKnowledge();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Knowledge document could not be archived"
      );
    } finally {
      setArchiving(false);
    }
  }

  async function deleteDocument(): Promise<void> {
    if (!deleteTarget || deleting) {
      return;
    }

    try {
      setDeleting(true);

      const { data: response } = await api.delete(`/knowledge/${deleteTarget.id}`);

      if (!response?.success) {
        throw new Error(response?.message ?? "Knowledge document could not be deleted");
      }

      toast.success("Knowledge document deleted");
      setDeleteTarget(null);
      await refreshKnowledge();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Knowledge document could not be deleted"
      );
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading knowledge documents...</p>;
  }

  const documents = (data ?? []) as KnowledgeDocument[];

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Search size={22} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">No documents uploaded</h2>
        <p className="mt-2 text-sm text-slate-500">Upload your first knowledge document.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <Input
          placeholder="Search documents"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Classification</th>
              <th className="px-4 py-3 font-semibold">Attachments</th>
              <th className="px-4 py-3 font-semibold">Indexed</th>
              <th className="px-4 py-3 font-semibold">Uploaded</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {documents.map(document => {
              const attached = document.dependencySummary.campaignCount;
              const indexed = document.isIndexed;
              const dependencies = document.dependencySummary;

              return (
                <tr key={document.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">{document.originalName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        document.status === "ARCHIVED"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700",
                      ].join(" ")}
                    >
                      {document.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">{document.classification}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    <p>{attached.toLocaleString("en-US")} campaign{attached === 1 ? "" : "s"}</p>
                    <p className="mt-1">{dependencies.ivrFlowCount} IVR flow{dependencies.ivrFlowCount === 1 ? "" : "s"} · {dependencies.publishedIvrVersionCount} published version{dependencies.publishedIvrVersionCount === 1 ? "" : "s"}</p>
                    {dependencies.liveDeploymentCount > 0 && <p className="mt-1 font-medium text-amber-700">{dependencies.liveDeploymentCount} live deployment{dependencies.liveDeploymentCount === 1 ? "" : "s"}</p>}
                    {document.campaignNames?.length ? (
                      <div className="mt-2 text-xs text-slate-500">
                        {document.campaignNames.slice(0, 3).map(campaign => campaign.name).join(", ")}
                        {document.campaignNames.length > 3 ? "..." : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {indexed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        Indexed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle size={14} />
                        Indexing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {new Date(document.uploadedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={document.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                        <ExternalLink size={12} />
                      </a>

                      {canMutate && (
                        <>
                          {dependencies.editAllowed && <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => openEditDialog(document)}
                          >
                            <Pencil size={12} className="mr-1" />
                            Edit
                          </Button>}

                          {document.status === "ACTIVE" && <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => setArchiveTarget(document)}
                          >
                            <Archive size={12} className="mr-1" />
                            Archive
                          </Button>}

                          {dependencies.deleteAllowed ? <Button
                            type="button"
                            variant="destructive"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => setDeleteTarget(document)}
                          >
                            <Trash2 size={12} className="mr-1" />
                            Delete
                          </Button> : <span className="text-xs text-slate-500" title={dependencies.deleteBlockReason ?? undefined}>{dependencies.deleteBlockReason ?? "Deletion is not permitted"}</span>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(editingDocument)}
        onOpenChange={open => {
          if (!open && !savingEdit) {
            setEditingDocument(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={editName}
              onChange={event => setEditName(event.target.value)}
              placeholder="Document name"
            />

            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={editClassification}
              onChange={event => setEditClassification(event.target.value)}
            >
              <option value="PUBLIC_PRODUCT_INFO">Public product info</option>
              <option value="INTERNAL">Internal</option>
              <option value="CUSTOMER_PERSONAL">Customer personal</option>
              <option value="SENSITIVE">Sensitive</option>
              <option value="RESTRICTED">Restricted</option>
            </select>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => void saveMetadata()}
                disabled={savingEdit}
              >
                {savingEdit ? "Saving..." : "Save"}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingDocument(null)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={open => {
          if (!open && !archiving) {
            setArchiveTarget(null);
          }
        }}
        title="Archive document?"
        description="Archived documents stop appearing as new campaign attachments, but existing audit and attachment history remains."
        confirmText="Archive"
        loading={archiving}
        onConfirm={() => void archiveDocument()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={open => {
          if (!open && !deleting) {
            setDeleteTarget(null);
          }
        }}
        title="Permanently delete document?"
        description="Permanent deletion is blocked while the document is attached to campaigns. Archive it first, then detach it from any campaigns before deleting."
        confirmText="Delete"
        loading={deleting}
        onConfirm={() => void deleteDocument()}
      />
    </div>
  );
}
