"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import IVRCanvas from "@/components/ivr/ivr-canvas";
import IVRSidebar from "@/components/ivr/ivr-sidebar";

import {
  IVRBuilderProvider,
} from "@/components/ivr/ivr-builder-context";

import type {
  IVRBuilderResourceCatalog,
  IVRBuilderTargetContext,
} from "@/services/ivr/ivr-builder-catalog.service";

import type { IVRFlowTemplate } from "@/services/ivr/ivr-flow-templates.service";

interface BuilderContextResponse {
  target: IVRBuilderTargetContext;
  catalog: IVRBuilderResourceCatalog;
  templates: IVRFlowTemplate[];
}

export default function IVRBuilderPage() {
  const searchParams = useSearchParams();
  const [builderData, setBuilderData] = useState<BuilderContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBuilderContext() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        const campaignId = searchParams.get("campaignId") ?? searchParams.get("campaign");
        const inboundProfileId =
          searchParams.get("inboundProfileId") ?? searchParams.get("inboundProfile");
        const returnTo = searchParams.get("returnTo");

        if (campaignId) {
          params.set("campaignId", campaignId);
        }

        if (inboundProfileId) {
          params.set("inboundProfileId", inboundProfileId);
        }

        if (returnTo) {
          params.set("returnTo", returnTo);
        }

        const response = await fetch(
          `/api/ivr-builder/context${params.toString() ? `?${params.toString()}` : ""}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.data) {
          throw new Error(payload?.message ?? "IVR builder context could not be loaded");
        }

        if (!cancelled) {
          setBuilderData(payload.data as BuilderContextResponse);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "IVR builder context could not be loaded"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBuilderContext();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-90px)] items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading IVR builder context...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-90px)] items-center justify-center bg-slate-50 px-6 text-center">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">IVR Builder unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <IVRBuilderProvider
      initialBuilderContext={builderData?.target}
      initialResourceCatalog={builderData?.catalog}
      initialTemplates={builderData?.templates}
      initialFlowId={searchParams.get("flowId") ?? undefined}
    >
      <div className="h-[calc(100vh-90px)] flex" data-tour="ivr-builder-canvas">
        <IVRSidebar />

        <IVRCanvas />
      </div>
    </IVRBuilderProvider>
  );
}
