"use client";

import IVRCanvas from "@/components/ivr/ivr-canvas";
import IVRSidebar from "@/components/ivr/ivr-sidebar";

import {
  IVRBuilderProvider,
} from "@/components/ivr/ivr-builder-context";

export default function IVRBuilderPage() {
  return (
    <IVRBuilderProvider>
      <div className="h-[calc(100vh-90px)] flex">
        <IVRSidebar />

        <IVRCanvas />
      </div>
    </IVRBuilderProvider>
  );
}