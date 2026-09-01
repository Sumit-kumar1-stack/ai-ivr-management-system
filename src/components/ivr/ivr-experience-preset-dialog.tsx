"use client";

import { useState } from "react";
import { Sparkles, Layers, ShieldCheck, Zap, HelpCircle, Check, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IVR_EXPERIENCE_PRESETS,
  type IVRExperiencePreset,
  applyPresetToFlow,
} from "@/services/ivr/ivr-experience-presets.service";
import { useIVRBuilder } from "./ivr-builder-context";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectPreset?: (preset: IVRExperiencePreset) => void;
}

const PRESET_ICONS: Record<IVRExperiencePreset, React.ElementType> = {
  CLASSIC_IVR: ShieldCheck,
  SMART_IVR: Layers,
  ADAPTIVE_IVR: Zap,
  CONVERSATIONAL_IVR: Sparkles,
  CUSTOM: HelpCircle,
};

export default function IVRExperiencePresetDialog({
  open,
  onClose,
  onSelectPreset,
}: Props) {
  const { nodes, edges, replaceGraph, markDirty } = useIVRBuilder();
  const [selectedPreset, setSelectedPreset] = useState<IVRExperiencePreset>("ADAPTIVE_IVR");
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!open) return null;

  const isBlankCanvas =
    nodes.length <= 1 && nodes.every(n => (n.data?.nodeKind ?? "START") === "START");

  const preview = applyPresetToFlow({ nodes, edges }, selectedPreset);

  function handleApply() {
    if (isBlankCanvas || !showConfirmation) {
      if (!isBlankCanvas && !showConfirmation) {
        setShowConfirmation(true);
        return;
      }
    }

    if (onSelectPreset) {
      onSelectPreset(selectedPreset);
    } else {
      replaceGraph({ nodes: preview.nodes, edges: preview.edges });
      markDirty();
    }

    setShowConfirmation(false);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-in fade-in-0"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <header className="mb-5">
          <div className="flex items-center justify-between">
            <h3 id="preset-dialog-title" className="text-xl font-bold tracking-tight text-slate-950">
              Choose an IVR Experience
            </h3>
            <Badge variant="outline" className="text-xs font-semibold text-slate-600">
              Builder Preset
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Select a starting architecture tailored to your customer experience and budget. Presets configure builder defaults without locking runtime execution.
          </p>
        </header>

        {!showConfirmation ? (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {IVR_EXPERIENCE_PRESETS.map(preset => {
              const Icon = PRESET_ICONS[preset.id];
              const isSelected = selectedPreset === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-lg p-2.5 ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            {preset.title}
                          </h4>
                          {preset.recommended && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wide">
                              Recommended
                            </span>
                          )}
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {preset.badge}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-600">
                          {preset.subtitle}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          {preset.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="text-sm font-semibold text-amber-900">
                Confirm Applying Preset to Existing Draft
              </h4>
              <p className="mt-1 text-xs text-amber-800">
                Applying <strong>{IVR_EXPERIENCE_PRESETS.find(p => p.id === selectedPreset)?.title}</strong> will update behavioral policies across your existing draft nodes. Custom action and transfer targets will be preserved.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Summary of Changes ({preview.changesCount} updates)
              </h5>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {preview.summary.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <footer className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          {showConfirmation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmation(false)}
            >
              Back to Presets
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              onClick={handleApply}
            >
              <span>{showConfirmation || isBlankCanvas ? "Apply Preset" : "Review & Apply"}</span>
              <ArrowRight size={14} />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
