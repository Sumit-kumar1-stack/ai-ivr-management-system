"use client";

import {
  Button,
} from "@/components/ui/button";

import {
  Input,
} from "@/components/ui/input";

import SaveFlowButton from "./save-flow-button";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface Props {
  onSave:
    () => void;

  onPublish:
    () => void;

  saving:
    boolean;

  publishing:
    boolean;

  canPublish:
    boolean;

  isPublished:
    boolean;
}

//--------------------------------------------------
// Toolbar
//--------------------------------------------------

export default function IVRToolbar({
  onSave,
  onPublish,
  saving,
  publishing,
  canPublish,
  isPublished,
}: Props) {
  const {
    flowName,
    setFlowName,

    campaignId,
    setCampaignId,
  } =
    useIVRBuilder();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-4">

      <div className="flex flex-wrap items-center gap-4">

        <h2 className="text-xl font-semibold">
          IVR Flow Builder
        </h2>

        <Input
          className="w-72"
          placeholder="Flow name"
          value={
            flowName
          }
          onChange={
            event =>
              setFlowName(
                event.target
                  .value
              )
          }
        />

        <Input
          className="w-80"
          placeholder="Campaign ID"
          value={
            campaignId
          }
          onChange={
            event =>
              setCampaignId(
                event.target
                  .value
              )
          }
        />

        {isPublished && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Published
          </span>
        )}

      </div>

      <div className="flex items-center gap-2">

        <SaveFlowButton
          loading={
            saving
          }
          onSave={
            onSave
          }
        />

        <Button
          type="button"
          onClick={
            onPublish
          }
          disabled={
            !canPublish ||
            publishing ||
            saving
          }
        >
          {publishing
            ? "Publishing..."
            : "Publish"}
        </Button>

      </div>

    </div>
  );
}