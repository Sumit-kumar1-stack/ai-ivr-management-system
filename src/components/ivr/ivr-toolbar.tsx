"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFlow } from "@/features/ivr/use-flow";
import SaveFlowButton from "./save-flow-button";
import { useIVRBuilder } from "./ivr-builder-context";
import IVRExperiencePresetDialog from "./ivr-experience-preset-dialog";

interface Props {
  onSave: () => void;
  onSubmitForApproval: () => void;
  saving: boolean;
  submitting: boolean;
  canSubmit: boolean;
  canEdit: boolean;
  isPublished: boolean;
  onShowProperties: () => void;
  onShowValidation: () => void;
  onShowSimulator: () => void;
  onAutoLayout?: () => void; onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  searchQuery?: string; onSearchQueryChange?: (query: string) => void; searchResults?: Array<{ id: string; label: string }>; onSearchResult?: (id: string) => void;
  onDuplicate?: () => void; canDuplicate?: boolean;
  onDelete?: () => void; canDelete?: boolean;
}

export default function IVRToolbar({
  onSave,
  onSubmitForApproval,
  saving,
  submitting,
  canSubmit,
  canEdit,
  isPublished,
  onShowProperties,
  onShowValidation,
  onShowSimulator,
  onAutoLayout, onUndo, onRedo, canUndo = false, canRedo = false, searchQuery = "", onSearchQueryChange, searchResults = [], onSearchResult, onDuplicate, canDuplicate = false, onDelete, canDelete = false,
}: Props) {
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const {
    selectedFlow,
    flowName,
    setFlowName,
    builderContext,
    markDirty,
    mode,
    setMode,
    saveState,
  } =
    useIVRBuilder();

  const { data: selectedFlowDetails } = useFlow(selectedFlow);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">IVR Flow Builder</h2>
            {selectedFlowDetails && <Badge variant="secondary">v{selectedFlowDetails.version}</Badge>}
            {selectedFlowDetails?.lifecycle && <Badge variant="outline">{selectedFlowDetails.lifecycle.replaceAll("_", " ")}</Badge>}
            {isPublished && <Badge>Published</Badge>}
            <Badge
              variant={saveState === "FAILED" ? "destructive" : "secondary"}
            >
              {saveState === "SAVING" ? "Saving..." : saveState === "SAVED" ? "Saved" : saveState === "FAILED" ? "Save failed" : "Unsaved changes"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {selectedFlowDetails?.name ?? "Draft flow"}
            {selectedFlowDetails?.versions ? ` - ${selectedFlowDetails.versions.length} version(s)` : ""}
          </p>
        </div>

        <Input
          className="w-72"
          placeholder="Flow name"
          value={flowName}
          disabled={!canEdit}
          onChange={event => {
            setFlowName(event.target.value);
            markDirty();
          }}
        />

        <div className="relative">
          <Input
            aria-label="Search flow nodes"
            className="w-56 pr-16"
            placeholder="Search nodes"
            value={searchQuery}
            onChange={event => onSearchQueryChange?.(event.target.value)}
          />
          {searchQuery && onSearchQueryChange && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => onSearchQueryChange("")}
              aria-label="Clear node search"
            >
              Clear
            </button>
          )}
          {searchQuery && <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg">
            {searchResults.length ? searchResults.map(result => <button key={result.id} type="button" onClick={() => onSearchResult?.(result.id)} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100">{result.label}</button>) : <p className="px-2 py-1.5 text-xs text-slate-500">No matching nodes</p>}
          </div>}
        </div>

        {builderContext.kind !== "STANDALONE" && (
          <Badge variant="outline">
            {builderContext.kind === "CAMPAIGN" ? "Campaign context" : "Inbound profile context"}
          </Badge>
        )}

        <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode("MANUAL")}
            className={[
              "rounded-full px-4 py-2 text-xs font-semibold transition",
              mode === "MANUAL" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            Manual Builder
          </button>
          <button
            type="button"
            onClick={() => setMode("AI")}
            className={[
              "rounded-full px-4 py-2 text-xs font-semibold transition",
              mode === "AI" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            Build with AI
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onUndo} disabled={!canUndo || !canEdit} aria-label="Undo graph change">Undo</Button>
          <Button type="button" variant="outline" onClick={onRedo} disabled={!canRedo || !canEdit} aria-label="Redo graph change">Redo</Button>
          <Button type="button" variant="outline" onClick={onAutoLayout} disabled={!canEdit} aria-label="Auto layout graph">Auto Layout</Button>
          <Button type="button" variant="outline" onClick={onDuplicate} disabled={!canDuplicate} aria-label="Duplicate selected node">Duplicate</Button>
          <Button type="button" variant="outline" onClick={onDelete} disabled={!canDelete} aria-label="Delete selected node">Delete</Button>
          <Button type="button" variant="outline" onClick={onShowProperties}>
            Properties
          </Button>
          <Button type="button" variant="outline" onClick={onShowValidation}>
            Validate
          </Button>
          <Button type="button" variant="outline" onClick={onShowSimulator}>
            Simulate
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPresetDialogOpen(true)}
            disabled={!canEdit}
            className="border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 font-medium gap-1.5"
          >
            <Sparkles size={14} />
            Presets
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/ivr-flows" className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Manage flows
        </Link>
        <SaveFlowButton loading={saving} disabled={!canEdit} onSave={onSave} />
        {canSubmit && (
          <Button
            type="button"
            variant="outline"
            onClick={onSubmitForApproval}
            disabled={submitting || saving}
          >
            {submitting ? "Submitting..." : "Submit for approval"}
          </Button>
        )}
      </div>

      <IVRExperiencePresetDialog
        open={presetDialogOpen}
        onClose={() => setPresetDialogOpen(false)}
      />
    </div>
  );
}
