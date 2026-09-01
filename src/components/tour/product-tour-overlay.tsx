"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Sparkles,
  X,
} from "lucide-react";

import { useProductTour } from "@/lib/product-tour-context";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function ProductTourOverlay() {
  const {
    isOpen,
    currentSection,
    currentStep,
    sectionIndex,
    stepIndex,
    totalSections,
    totalStepsInSection,
    nextStep,
    previousStep,
    skipTour,
    closeTour,
  } = useProductTour();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Locate and measure target element on DOM
  useEffect(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }

    function updatePosition() {
      if (!currentStep?.target) {
        setTargetRect(null);
        return;
      }

      const element = document.querySelector(currentStep.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });

        // Scroll element into view smoothly if needed
        element.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      } else {
        setTargetRect(null);
      }
    }

    // Small delay to allow Next.js route transition & DOM mounting
    const timer = setTimeout(updatePosition, 120);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [isOpen, currentStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeTour();
      } else if (e.key === "ArrowRight") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        previousStep();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nextStep, previousStep, closeTour]);

  if (!isOpen || !currentStep) return null;

  const isFirstStep = sectionIndex === 0 && stepIndex === 0;
  const isLastStep =
    sectionIndex === totalSections - 1 &&
    stepIndex === totalStepsInSection - 1;

  // Calculate overall progress percentage
  const currentTotalStep = sectionIndex * 10 + stepIndex + 1;
  const estimatedTotalSteps = totalSections * 10;
  const progressPercent = Math.min(
    100,
    Math.round(((sectionIndex + 1) / totalSections) * 100)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={currentStep.title}
      className="fixed inset-0 z-[9999] pointer-events-auto"
    >
      {/* Dark overlay backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={closeTour}
      />

      {/* Target Highlight Cutout/Ring */}
      {targetRect && (
        <div
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          className="absolute z-10 rounded-xl ring-4 ring-blue-500/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)] pointer-events-none transition-all duration-300 animate-pulse"
        />
      )}

      {/* Coachmark Dialog Card */}
      <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={cardRef}
          className="w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl pointer-events-auto transition-all duration-200 animate-in fade-in zoom-in-95 space-y-4"
        >
          {/* Header & Section Badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                  <Compass size={12} className="text-blue-600" />
                  {currentStep.badge ?? currentSection?.badge ?? "Tour"}
                </span>

                <span className="text-xs font-semibold text-slate-500">
                  Section {sectionIndex + 1} of {totalSections}
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {currentStep.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={closeTour}
              aria-label="Close tour"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Description Text */}
          <p className="text-sm leading-relaxed text-slate-700">
            {currentStep.description}
          </p>

          {/* Conceptual ASCII/Diagram block if available */}
          {currentStep.diagram && (
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-[11px] font-mono text-emerald-400 whitespace-pre leading-relaxed overflow-x-auto shadow-inner">
              {currentStep.diagram}
            </div>
          )}

          {/* Progress bar */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>
                {currentSection?.title ?? "Platform Tour"}
              </span>
              <span>
                Step {stepIndex + 1} of {totalStepsInSection}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
              />
            </div>
          </div>

          {/* Navigation Actions */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={skipTour}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors px-2 py-1"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isFirstStep}
                onClick={previousStep}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft size={13} />
                Back
              </button>

              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                {isLastStep ? (
                  <>
                    <Check size={14} />
                    Finish Tour
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
