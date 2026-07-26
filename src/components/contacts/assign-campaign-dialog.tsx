"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  Loader2,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useCampaigns,
} from "@/features/campaigns/use-campaigns";

import {
  useAssignCampaignContacts,
  type AssignCampaignContactsResult,
} from "@/features/campaigns/use-assign-campaign-contacts";

interface AssignCampaignDialogProps {
  open: boolean;

  contactIds: string[];

  onOpenChange: (
    open: boolean
  ) => void;

  onAssigned: () => void;
}

export default function AssignCampaignDialog({
  open,
  contactIds,
  onOpenChange,
  onAssigned,
}: AssignCampaignDialogProps) {
  const [
    campaignId,
    setCampaignId,
  ] =
    useState("");

  const [
    result,
    setResult,
  ] =
    useState<AssignCampaignContactsResult | null>(
      null
    );

  const {
    data:
      campaigns = [],

    isLoading:
      campaignsLoading,

    isError:
      campaignsError,
  } =
    useCampaigns();

  const assignmentMutation =
    useAssignCampaignContacts();

  const {
    mutate,
    reset,
    isPending,
    isError,
  } =
    assignmentMutation;

  useEffect(
    () => {
      if (
        open
      ) {
        return;
      }

      setCampaignId(
        ""
      );

      setResult(
        null
      );

      reset();
    },
    [
      open,
      reset,
    ]
  );

  function handleAssign(): void {
    if (
      !campaignId ||
      contactIds.length ===
        0 ||
      isPending
    ) {
      return;
    }

    setResult(
      null
    );

    mutate(
      {
        campaignId,
        contactIds,
      },
      {
        onSuccess: (
          assignmentResult
        ) => {
          setResult(
            assignmentResult
          );

          onAssigned();
        },
      }
    );
  }

  function handleClose(): void {
    if (
      isPending
    ) {
      return;
    }

    onOpenChange(
      false
    );
  }

  function handleDialogOpenChange(
    nextOpen: boolean
  ): void {
    if (
      isPending
    ) {
      return;
    }

    onOpenChange(
      nextOpen
    );
  }

  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        handleDialogOpenChange
      }
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />

            Assign to Campaign
          </DialogTitle>

          <DialogDescription>
            Assign{" "}
            {contactIds.length}{" "}
            {contactIds.length ===
            1
              ? "selected contact"
              : "selected contacts"}{" "}
            to an outbound campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {campaignsLoading && (
            <div
              className="
                flex
                min-h-28
                items-center
                justify-center
                rounded-xl
                border
              "
            >
              <Loader2
                className="
                  h-6
                  w-6
                  animate-spin
                  text-muted-foreground
                "
              />
            </div>
          )}

          {campaignsError && (
            <div
              className="
                flex
                gap-3
                rounded-xl
                border
                border-destructive/30
                bg-destructive/5
                p-4
                text-sm
                text-destructive
              "
            >
              <AlertCircle
                className="
                  mt-0.5
                  h-4
                  w-4
                  shrink-0
                "
              />

              Unable to load campaigns.
            </div>
          )}

          {!campaignsLoading &&
            !campaignsError &&
            campaigns.length ===
              0 && (
              <div
                className="
                  rounded-xl
                  border
                  border-dashed
                  p-6
                  text-center
                "
              >
                <p className="font-medium">
                  No campaigns available
                </p>

                <p
                  className="
                    mt-1
                    text-sm
                    text-muted-foreground
                  "
                >
                  Create a campaign before assigning contacts.
                </p>
              </div>
            )}

          {!campaignsLoading &&
            !campaignsError &&
            campaigns.length >
              0 && (
              <div className="space-y-2">
                <label
                  htmlFor="campaign"
                  className="text-sm font-medium"
                >
                  Campaign
                </label>

                <select
                  id="campaign"
                  value={
                    campaignId
                  }
                  disabled={
                    isPending ||
                    Boolean(
                      result
                    )
                  }
                  onChange={(
                    event
                  ) =>
                    setCampaignId(
                      event.target.value
                    )
                  }
                  className="
                    h-10
                    w-full
                    rounded-md
                    border
                    border-input
                    bg-background
                    px-3
                    text-sm
                    outline-none
                    focus:ring-2
                    focus:ring-ring
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  <option value="">
                    Select campaign
                  </option>

                  {campaigns.map(
                    (
                      campaign
                    ) => (
                      <option
                        key={
                          campaign.id
                        }
                        value={
                          campaign.id
                        }
                      >
                        {campaign.name}{" "}
                        (
                        {campaign.contactCount}{" "}
                        contacts)
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

          {isError && (
            <div
              className="
                flex
                gap-3
                rounded-xl
                border
                border-destructive/30
                bg-destructive/5
                p-4
                text-sm
                text-destructive
              "
            >
              <AlertCircle
                className="
                  mt-0.5
                  h-4
                  w-4
                  shrink-0
                "
              />

              Failed to assign contacts. Please try again.
            </div>
          )}

          {result && (
            <div
              className="
                rounded-xl
                border
                border-green-500/30
                bg-green-500/5
                p-4
              "
            >
              <div className="flex gap-3">
                <CheckCircle2
                  className="
                    mt-0.5
                    h-5
                    w-5
                    shrink-0
                    text-green-600
                  "
                />

                <div>
                  <p className="font-medium text-green-700">
                    Assignment completed
                  </p>

                  <div
                    className="
                      mt-2
                      space-y-1
                      text-sm
                      text-muted-foreground
                    "
                  >
                    <p>
                      Newly assigned:{" "}
                      <span className="font-medium text-foreground">
                        {result.assigned}
                      </span>
                    </p>

                    <p>
                      Already assigned:{" "}
                      <span className="font-medium text-foreground">
                        {result.duplicates}
                      </span>
                    </p>

                    <p>
                      Selected total:{" "}
                      <span className="font-medium text-foreground">
                        {result.total}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={
              isPending
            }
            onClick={
              handleClose
            }
          >
            {result
              ? "Close"
              : "Cancel"}
          </Button>

          {!result && (
            <Button
              type="button"
              disabled={
                !campaignId ||
                contactIds.length ===
                  0 ||
                campaignsLoading ||
                campaigns.length ===
                  0 ||
                isPending
              }
              onClick={
                handleAssign
              }
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />

                  Assigning...
                </>
              ) : (
                <>
                  <FolderPlus className="mr-2 h-4 w-4" />

                  Assign Contacts
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}