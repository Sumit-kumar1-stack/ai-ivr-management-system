"use client";

import React from "react";
import {
  AudioLines,
  BarChart3,
  BookOpen,
  Compass,
  Layers,
  Megaphone,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";

import { useProductTour } from "@/lib/product-tour-context";
import type { ProductTourMode } from "@/config/product-tour.config";

interface TourCardOption {
  mode: ProductTourMode;
  title: string;
  badge: string;
  description: string;
  duration: string;
  icon: typeof MessageSquare;
  highlight?: boolean;
}

const TOUR_OPTIONS: TourCardOption[] = [
  {
    mode: "FULL_PLATFORM",
    title: "Full Platform Tour",
    badge: "Recommended",
    description: "Comprehensive 21-section guide through Voice, SMS, WhatsApp, IVR Builder, Governance, Analytics, and Integrations.",
    duration: "8 min",
    icon: Compass,
    highlight: true,
  },
  {
    mode: "DEMOBANK",
    title: "DemoBank Guided Demo",
    badge: "Business Story",
    description: "Follow an end-to-end loan application story across Knowledge RAG, Adaptive IVR, WhatsApp dispatch, and Call Recordings.",
    duration: "5 min",
    icon: Sparkles,
    highlight: true,
  },
  {
    mode: "IVR_BUILDER",
    title: "Visual IVR Builder",
    badge: "Visual Canvas",
    description: "Learn how to build deterministic and AI-powered flows with Start, Greeting, Menu, Knowledge, and Transfer nodes.",
    duration: "3 min",
    icon: Wrench,
  },
  {
    mode: "INBOUND_VOICE",
    title: "Inbound Voice Telephony",
    badge: "Telephony",
    description: "Explore provider-neutral inbound routing across Twilio, Plivo, and Exotel phone profiles and webhooks.",
    duration: "3 min",
    icon: PhoneCall,
  },
  {
    mode: "OUTBOUND_CAMPAIGN",
    title: "Outbound Campaigns",
    badge: "Governance",
    description: "Understand the campaign wizard, multi-channel selection, and Maker/Checker dual-control approval queues.",
    duration: "3 min",
    icon: Megaphone,
  },
  {
    mode: "SMS",
    title: "SMS Provider Architecture",
    badge: "SMS Providers",
    description: "Learn how Twilio, Plivo, and Exotel SMS adapters operate with centralized status callbacks and zero credential leakage.",
    duration: "2 min",
    icon: MessageSquare,
  },
  {
    mode: "WHATSAPP",
    title: "Meta WhatsApp Business",
    badge: "WhatsApp",
    description: "Explore official Meta WhatsApp templates, dynamic variables, opt-in consent, and read receipts.",
    duration: "2 min",
    icon: Smartphone,
  },
  {
    mode: "OMNICHANNEL",
    title: "OmniChannel & Fallbacks",
    badge: "Resilience",
    description: "Explore Voice-to-SMS Tool Gateway actions and automatic WhatsApp-to-SMS delivery fallbacks.",
    duration: "3 min",
    icon: Zap,
  },
  {
    mode: "ANALYTICS",
    title: "Analytics & Telemetry",
    badge: "Reporting",
    description: "Review call volumes, duration metrics, SMS delivery receipts, and campaign conversion rates.",
    duration: "2 min",
    icon: BarChart3,
  },
];

export default function ProductTourWelcomeModal() {
  const { isWelcomeOpen, startTour, dismissWelcome } = useProductTour();

  if (!isWelcomeOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={dismissWelcome}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl z-10 space-y-6 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                <Sparkles size={13} className="text-blue-600" />
                OmniIVR Platform
              </span>
              <span className="text-xs font-semibold text-slate-400">
                Interactive Guided Tour
              </span>
            </div>

            <h2
              id="welcome-tour-title"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
            >
              Welcome to OmniIVR
            </h2>

            <p className="text-sm text-slate-600 max-w-xl">
              Build, automate and monitor customer journeys across{" "}
              <strong className="text-slate-900">Voice, SMS and WhatsApp</strong> with
              provider-neutral architecture and enterprise governance.
            </p>
          </div>

          <button
            type="button"
            onClick={dismissWelcome}
            aria-label="Dismiss welcome dialog"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tour Modes Grid */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Select Tour Mode
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {TOUR_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => startTour(opt.mode)}
                  className={`flex flex-col text-left rounded-2xl p-4 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    opt.highlight
                      ? "border-blue-300 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          opt.highlight
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {opt.title}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        opt.highlight
                          ? "bg-blue-200/80 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {opt.duration}
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={dismissWelcome}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            Skip for now
          </button>

          <button
            type="button"
            onClick={() => startTour("FULL_PLATFORM")}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-colors"
          >
            <Compass size={15} />
            Start Full Platform Tour
          </button>
        </div>
      </div>
    </div>
  );
}
