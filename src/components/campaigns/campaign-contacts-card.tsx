"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/confirm-dialog";

import { useCampaignContacts } from "@/features/campaigns/use-campaign-contacts";
import { useRemoveContact } from "@/features/campaigns/use-remove-contact";

interface Props {
  campaignId: string;
}

export default function CampaignContactsCard({
  campaignId,
}: Props) {
  const { data } = useCampaignContacts(campaignId);

  const remove = useRemoveContact();

  const [selectedContact, setSelectedContact] =
    useState<any>(null);

  const [dialogOpen, setDialogOpen] =
    useState(false);

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Assigned Contacts
        </h2>
      </div>

      <div className="mt-5 space-y-3">
        {data?.data?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold">
              No Contacts Assigned
            </h3>

            <p className="mt-2 text-gray-500">
              Assign contacts to make this campaign ready for AI calling.
            </p>
          </div>
        )}

        {data?.data?.map((contact: any) => (
          <div
            key={contact.id}
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <div>
              <p className="font-semibold">
                {contact.fullName}
              </p>

              <p className="text-sm text-gray-500">
                {contact.phone}
              </p>

              <p className="text-sm">
                {contact.language}
              </p>

              <p className="text-sm">
                {contact.status}
              </p>
            </div>

            <Button
              variant="destructive"
              onClick={() => {
                setSelectedContact(contact);
                setDialogOpen(true);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Remove Contact"
        description={`Are you sure you want to remove ${
          selectedContact?.fullName ?? ""
        } from this campaign?`}
        confirmText="Remove"
        loading={remove.isPending}
        onConfirm={() => {
          if (!selectedContact) return;

          remove.mutate(
            {
              campaignId,
              contactId: selectedContact.id,
            },
            {
              onSuccess() {
                setDialogOpen(false);
                setSelectedContact(null);
              },
            }
          );
        }}
      />
    </div>
  );
}