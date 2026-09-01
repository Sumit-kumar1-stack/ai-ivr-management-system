"use client";

import React from "react";
import { Compass, RotateCcw, X, Play } from "lucide-react";
import { useProductTour } from "@/lib/product-tour-context";

export default function ProductTourResumeDialog() {
  const {
    isResumeOpen,
    mode,
    sectionIndex,
    totalSections,
    resumeTour,
    restartTour,
    dismissResume,
  } = useProductTour();

  if (!isResumeOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-tour-title"
      className="fixed inset-0 z-[9997] flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
        onClick={dismissResume}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl z-10 space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Compass size={20} />
            </div>
            <div>
              <h3 id="resume-tour-title" className="font-bold text-slate-900 text-base">
                Continue your OmniIVR Tour?
              </h3>
              <p className="text-xs text-slate-500">
                Mode: {mode?.replace(/_/g, " ") ?? "Platform Tour"} • Section {sectionIndex + 1} of {totalSections}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissResume}
            aria-label="Dismiss resume dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          You have an active tour in progress. You can pick up right where you left off or start over from the beginning.
        </p>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={dismissResume}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors px-2 py-1.5"
          >
            Dismiss
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restartTour}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={13} />
              Start Over
            </button>

            <button
              type="button"
              onClick={resumeTour}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Play size={13} />
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
