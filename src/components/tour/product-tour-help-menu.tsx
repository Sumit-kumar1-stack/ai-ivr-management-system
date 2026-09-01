"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  BarChart3,
  Compass,
  HelpCircle,
  Megaphone,
  MessageSquare,
  PhoneCall,
  RotateCcw,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

import { useProductTour } from "@/lib/product-tour-context";
import type { ProductTourMode } from "@/config/product-tour.config";

export default function ProductTourHelpMenu() {
  const { startTour, restartTour } = useProductTour();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleSelect(mode: ProductTourMode) {
    setIsOpen(false);
    startTour(mode);
  }

  function handleRestart() {
    setIsOpen(false);
    restartTour();
  }

  return (
    <div ref={menuRef} className="relative inline-block text-left" data-tour="help-tour-menu">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Compass size={14} className="text-blue-600" />
        <span>Product Tour</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in zoom-in-95 space-y-1">
          <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Guided Walkthroughs
          </div>

          <button
            type="button"
            onClick={() => handleSelect("FULL_PLATFORM")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-900 transition-colors text-left"
          >
            <Compass size={15} className="text-blue-600 shrink-0" />
            <div>
              <p>Full Platform Tour</p>
              <p className="text-[10px] font-normal text-slate-500">21 core sections (8 min)</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("DEMOBANK")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 transition-colors text-left"
          >
            <Sparkles size={15} className="text-indigo-600 shrink-0" />
            <div>
              <p>DemoBank Loan Story</p>
              <p className="text-[10px] font-normal text-slate-500">End-to-end customer demo</p>
            </div>
          </button>

          <div className="h-px bg-slate-100 my-1" />

          <button
            type="button"
            onClick={() => handleSelect("IVR_BUILDER")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <Wrench size={14} className="text-slate-500 shrink-0" />
            <span>Visual IVR Builder</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("INBOUND_VOICE")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <PhoneCall size={14} className="text-slate-500 shrink-0" />
            <span>Inbound Voice Telephony</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("OUTBOUND_CAMPAIGN")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <Megaphone size={14} className="text-slate-500 shrink-0" />
            <span>Outbound Campaigns</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("SMS")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <MessageSquare size={14} className="text-slate-500 shrink-0" />
            <span>SMS Provider Setup</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("OMNICHANNEL")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <Zap size={14} className="text-slate-500 shrink-0" />
            <span>OmniChannel & Fallback</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("ANALYTICS")}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left"
          >
            <BarChart3 size={14} className="text-slate-500 shrink-0" />
            <span>Analytics & Reporting</span>
          </button>

          <div className="h-px bg-slate-100 my-1" />

          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-2.5 w-full rounded-xl px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors text-left"
          >
            <RotateCcw size={13} className="text-slate-400 shrink-0" />
            <span>Restart Tour Progress</span>
          </button>
        </div>
      )}
    </div>
  );
}
