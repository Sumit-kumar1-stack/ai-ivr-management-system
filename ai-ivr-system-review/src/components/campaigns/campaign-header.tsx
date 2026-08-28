"use client";

import {
  AlertCircle,
  Loader2,
  Play,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import ManageContactsDialog from "./manage-contacts-dialog";
import CampaignSkeleton from "./campaign-skeleton";

import {
  useCampaign,
} from "@/features/campaigns/use-campaigns";

import {
  useStartCampaign,
} from "@/features/campaigns/use-start-campaign";

interface CampaignHeaderProps {
  campaignId: string;
}

export default function CampaignHeader({
  campaignId,
}: CampaignHeaderProps) {
  const {
    data,
    isLoading,
    isError,
  } =
    useCampaign(
      campaignId
    );

  const startCampaign =
    useStartCampaign();

  if (
    isLoading
  ) {
    return (
      <CampaignSkeleton />
    );
  }

  if (
    isError ||
    !data
  ) {
    return (
      <div
        className="
          flex
          items-center
          gap-3
          rounded-lg
          border
          border-destructive/30
          bg-destructive/5
          p-6
          text-destructive
        "
      >
        <AlertCircle
          className="
            h-5
            w-5
            shrink-0
          "
        />

        Failed to load campaign details.
      </div>
    );
  }

  const isQueued =
    data.status ===
    "QUEUED";

  const isRunning =
    data.status ===
    "RUNNING";

  const hasContacts =
    data.contactCount >
    0;

  const cannotStart =
    !hasContacts ||
    isQueued ||
    isRunning ||
    startCampaign.isPending;

  function getButtonText(): string {
    if (
      startCampaign.isPending
    ) {
      return "Starting...";
    }

    if (
      isRunning
    ) {
      return "Campaign Running";
    }

    if (
      isQueued
    ) {
      return "Campaign Queued";
    }

    if (
      !hasContacts
    ) {
      return "No Contacts Assigned";
    }

    return "Start Campaign";
  }

  return (
    <div
      className="
        flex
        flex-col
        gap-6
        rounded-lg
        border
        bg-card
        p-6
        shadow-sm
        lg:flex-row
        lg:items-center
        lg:justify-between
      "
    >
      <div>
        <h1 className="text-3xl font-bold">
          {data.name}
        </h1>

        <div
          className="
            mt-3
            space-y-1
            text-sm
            text-muted-foreground
          "
        >
          <p>
            Language:{" "}
            <span className="font-medium text-foreground">
              {data.language}
            </span>
          </p>

          <p>
            Voice:{" "}
            <span className="font-medium text-foreground">
              {data.voice}
            </span>
          </p>

          <p>
            Status:{" "}
            <span className="font-medium text-foreground">
              {data.status}
            </span>
          </p>

          <p>
            <span className="font-medium text-foreground">
              {data.contactCount}
            </span>{" "}
            {data.contactCount === 1
              ? "Contact"
              : "Contacts"}
          </p>
        </div>
      </div>

      <div
        className="
          flex
          flex-wrap
          gap-3
        "
      >
        <ManageContactsDialog
          campaignId={
            campaignId
          }
        />

        <Button
          type="button"
          disabled={
            cannotStart
          }
          onClick={() =>
            startCampaign.mutate(
              campaignId
            )
          }
        >
          {startCampaign.isPending ? (
            <Loader2
              className="
                mr-2
                h-4
                w-4
                animate-spin
              "
            />
          ) : (
            <Play
              className="
                mr-2
                h-4
                w-4
              "
            />
          )}

          {getButtonText()}
        </Button>
      </div>
    </div>
  );
}