"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";

import type { MessagingProviderDescriptor } from "@/services/messaging/messaging.types";

interface MessagingProviderSettingsProps {
  initialProviders?: MessagingProviderDescriptor[];
  initialPreferred?: {
    sms: string | null;
    whatsapp: string | null;
  };
}

interface ApiResponseData {
  providers: MessagingProviderDescriptor[];
  preferred: {
    sms: string | null;
    whatsapp: string | null;
  };
}

const CAPABILITY_LABELS: Record<string, string> = {
  SMS_OUTBOUND: "Outbound SMS",
  SMS_STATUS_CALLBACK: "Status Callbacks",
  WHATSAPP_OUTBOUND: "Outbound WhatsApp",
  WHATSAPP_TEMPLATE: "Template Messages",
  WHATSAPP_STATUS_CALLBACK: "Status Webhooks",
  WHATSAPP_READ_RECEIPT: "Read Receipts",
};

export default function MessagingProviderSettings({
  initialProviders,
  initialPreferred,
}: MessagingProviderSettingsProps) {
  const [providers, setProviders] = useState<MessagingProviderDescriptor[]>(
    initialProviders ?? []
  );
  const [preferred, setPreferred] = useState<{
    sms: string | null;
    whatsapp: string | null;
  }>(
    initialPreferred ?? {
      sms: "TWILIO",
      whatsapp: "META",
    }
  );
  const [loading, setLoading] = useState(!initialProviders);
  const [error, setError] = useState<string | null>(null);

  async function fetchProviders() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/messaging/providers", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ?? "Failed to load messaging providers"
        );
      }

      const data = result.data as ApiResponseData;
      setProviders(data.providers);
      setPreferred(data.preferred);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while loading messaging providers"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialProviders) {
      void fetchProviders();
    }
  }, [initialProviders]);

  const smsProviders = providers.filter((p) => p.channel === "SMS");
  const whatsappProviders = providers.filter(
    (p) => p.channel === "WHATSAPP"
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-6" data-tour="messaging-providers">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">
              Messaging Providers
            </h2>
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              Deployment Diagnostics
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Runtime status, capability matrix, and deployment configuration
            for SMS and WhatsApp channels.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchProviders()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            size={13}
            className={loading ? "animate-spin" : ""}
          />
          Refresh Status
        </button>
      </div>

      {/* Error notification */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3">
          <AlertCircle size={18} className="text-rose-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to fetch provider status</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Preferred Deployment Configuration Banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-center justify-between gap-2 border-b border-blue-100/80 pb-3">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-blue-700" />
            <h3 className="text-sm font-semibold text-blue-950">
              Deployment Routing Preferences
            </h3>
          </div>
          <span className="text-[11px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
            Environment Read-Only
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-slate-600 font-medium">Preferred SMS Provider:</span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
              {preferred.sms ?? "TWILIO (Default)"}
            </span>
          </div>

          <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
            <span className="text-slate-600 font-medium">
              Preferred WhatsApp Provider:
            </span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
              {preferred.whatsapp ?? "META (Default)"}
            </span>
          </div>
        </div>

        <p className="mt-2.5 text-[11px] text-blue-800/80 leading-relaxed">
          Provider preferences are declared via server environment variables (
          <code className="font-mono bg-blue-100/60 px-1 py-0.5 rounded">SMS_PROVIDER</code>,{" "}
          <code className="font-mono bg-blue-100/60 px-1 py-0.5 rounded">WHATSAPP_PROVIDER</code>).
        </p>
      </div>

      {/* SMS Providers */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-slate-700" />
          <h3 className="text-base font-semibold text-slate-900">
            SMS Providers
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {smsProviders.map((provider) => (
            <ProviderCard key={provider.provider} descriptor={provider} />
          ))}
        </div>
      </div>

      {/* WhatsApp Providers */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-slate-700" />
          <h3 className="text-base font-semibold text-slate-900">
            WhatsApp Providers
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {whatsappProviders.map((provider) => (
            <ProviderCard key={provider.provider} descriptor={provider} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProviderCard({
  descriptor,
}: {
  descriptor: MessagingProviderDescriptor;
}) {
  const isAvailable = descriptor.available;
  const isConfigured = descriptor.configured;
  const isEnabled = descriptor.enabled;

  return (
    <div
      className={`rounded-xl border bg-white p-4 space-y-3 transition-shadow ${
        isEnabled
          ? "border-blue-300 ring-1 ring-blue-100 shadow-xs"
          : "border-slate-200"
      }`}
    >
      {/* Provider Title & Availability */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="font-semibold text-slate-900 text-sm">
              {descriptor.label}
            </h4>
            {isEnabled && (
              <span className="rounded bg-blue-100 text-blue-800 text-[10px] font-semibold px-1.5 py-0.5">
                Active Provider
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">
            {descriptor.provider}
          </span>
        </div>

        {isAvailable ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Available
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            <XCircle size={12} className="text-slate-500" />
            Unavailable
          </span>
        )}
      </div>

      {/* State Badges Grid */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 border border-slate-100">
          <span className="text-slate-500">Configuration:</span>
          {isConfigured ? (
            <span className="font-semibold text-emerald-700">Configured</span>
          ) : (
            <span className="font-semibold text-amber-700">Not Configured</span>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 border border-slate-100">
          <span className="text-slate-500">Deployment:</span>
          {isEnabled ? (
            <span className="font-semibold text-blue-700">Enabled</span>
          ) : (
            <span className="font-semibold text-slate-600">Disabled</span>
          )}
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
          Capabilities
        </span>
        <div className="flex flex-wrap gap-1">
          {descriptor.capabilities.map((cap) => (
            <span
              key={cap}
              className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 font-medium"
            >
              <ShieldCheck size={10} className="text-slate-500" />
              {CAPABILITY_LABELS[cap] ?? cap}
            </span>
          ))}
        </div>
      </div>

      {/* Missing Configuration Notice (Safe Env Var Names Only) */}
      {!isConfigured &&
        descriptor.missingConfigurationKeys &&
        descriptor.missingConfigurationKeys.length > 0 && (
          <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-2.5 text-[11px] text-amber-900 space-y-1">
            <div className="flex items-center gap-1 font-semibold text-amber-800">
              <AlertCircle size={12} className="text-amber-600" />
              Missing Environment Variables:
            </div>
            <ul className="list-disc list-inside font-mono text-[10px] text-amber-900 space-y-0.5">
              {descriptor.missingConfigurationKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
