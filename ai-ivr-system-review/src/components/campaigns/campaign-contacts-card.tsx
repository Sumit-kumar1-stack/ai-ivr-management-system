"use client";

import {
  useState,
} from "react";

import type {
  ContactDTO,
} from "@/features/contacts/contact.types";

import {
  Button,
} from "@/components/ui/button";

import ConfirmDialog from "@/components/ui/confirm-dialog";

import {
  useCampaignContacts,
} from "@/features/campaigns/use-campaign-contacts";

import {
  useRemoveContact,
} from "@/features/campaigns/use-remove-contact";

interface CampaignContactsCardProps {
  campaignId: string;
}

export default function CampaignContactsCard({
  campaignId,
}: CampaignContactsCardProps) {
  const {
    data: contacts = [],
    isLoading,
    isError,
  } =
    useCampaignContacts(
      campaignId
    );

  const removeContact =
    useRemoveContact();

  const [
    selectedContact,
    setSelectedContact,
  ] =
    useState<ContactDTO | null>(
      null
    );

  const [
    dialogOpen,
    setDialogOpen,
  ] =
    useState(false);

  if (
    isLoading
  ) {
    return (
      <div className="rounded-lg border p-6">
        <h2 className="text-xl font-bold">
          Assigned Contacts
        </h2>

        <div className="py-12 text-center text-muted-foreground">
          Loading assigned contacts...
        </div>
      </div>
    );
  }

  if (
    isError
  ) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-xl font-bold">
          Assigned Contacts
        </h2>

        <p className="mt-4 text-sm text-destructive">
          Failed to load assigned contacts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Assigned Contacts
        </h2>

        <p className="text-sm text-muted-foreground">
          {contacts.length}{" "}
          {contacts.length === 1
            ? "contact"
            : "contacts"}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold">
              No Contacts Assigned
            </h3>

            <p className="mt-2 text-muted-foreground">
              Assign contacts to make this campaign ready for AI calling.
            </p>
          </div>
        ) : (
          contacts.map(
            (
              contact: ContactDTO
            ) => (
              <div
                key={
                  contact.id
                }
                className="
                  flex
                  flex-col
                  gap-4
                  rounded-lg
                  border
                  p-4
                  sm:flex-row
                  sm:items-center
                  sm:justify-between
                "
              >
                <div>
                  <p className="font-semibold">
                    {contact.fullName}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    {contact.phone}
                  </p>

                  {contact.email && (
                    <p className="text-sm text-muted-foreground">
                      {contact.email}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-md border px-2 py-1">
                      {contact.language}
                    </span>

                    <span className="rounded-md border px-2 py-1">
                      {contact.status}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    removeContact.isPending
                  }
                  onClick={() => {
                    setSelectedContact(
                      contact
                    );

                    setDialogOpen(
                      true
                    );
                  }}
                >
                  Remove
                </Button>
              </div>
            )
          )
        )}
      </div>

      <ConfirmDialog
        open={
          dialogOpen
        }
        onOpenChange={
          setDialogOpen
        }
        title="Remove Contact"
        description={`Are you sure you want to remove ${
          selectedContact?.fullName ??
          "this contact"
        } from this campaign?`}
        confirmText="Remove"
        loading={
          removeContact.isPending
        }
        onConfirm={() => {
          if (
            !selectedContact
          ) {
            return;
          }

          removeContact.mutate(
            {
              campaignId,

              contactId:
                selectedContact.id,
            },
            {
              onSuccess: () => {
                setDialogOpen(
                  false
                );

                setSelectedContact(
                  null
                );
              },
            }
          );
        }}
      />
    </div>
  );
}