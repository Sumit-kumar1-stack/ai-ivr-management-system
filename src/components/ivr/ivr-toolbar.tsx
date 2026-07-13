"use client";

import { Input } from "@/components/ui/input";
import SaveFlowButton from "./save-flow-button";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

interface Props {
  onSave: () => void;
  saving: boolean;
}

export default function IVRToolbar({
  onSave,
  saving,
}: Props) {
  const {
    flowName,
    setFlowName,
  } = useIVRBuilder();

  return (
    <div className="flex items-center justify-between border-b bg-white p-4">

      <div className="flex items-center gap-4">

        <h2 className="text-xl font-semibold">
          IVR Flow Builder
        </h2>

        <Input
          className="w-80"
          placeholder="Enter flow name..."
          value={flowName}
          onChange={(e) =>
            setFlowName(e.target.value)
          }
        />

      </div>

      <SaveFlowButton
        loading={saving}
        onSave={onSave}
      />

    </div>
  );
}