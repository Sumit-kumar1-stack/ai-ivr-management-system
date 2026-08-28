"use client";

import {
  useState,
} from "react";

import {
  useContacts,
} from "@/features/contacts/use-contacts";

import {
  useContactStats,
} from "@/features/contacts/use-contact-stats";

import AssignCampaignDialog from "@/components/contacts/assign-campaign-dialog";
import ContactBulkActions from "@/components/contacts/contact-bulk-actions";
import ContactStats from "@/components/contacts/contact-stats";
import ContactFilters from "@/components/contacts/contact-filters";
import ContactTable from "@/components/contacts/contact-table";
import Pagination from "@/components/contacts/pagination";
import UploadCSV from "@/components/contacts/upload-csv";
import ContactForm from "@/components/contacts/contact-form";

const DEFAULT_PAGE =
  1;

const DEFAULT_LIMIT =
  10;

export default function ContactsPageContent() {
  const [
    page,
    setPage,
  ] =
    useState(
      DEFAULT_PAGE
    );

  const [
    limit,
    setLimit,
  ] =
    useState(
      DEFAULT_LIMIT
    );

  const [
    searchInput,
    setSearchInput,
  ] =
    useState("");

  const [
    appliedSearch,
    setAppliedSearch,
  ] =
    useState("");

  const [
    language,
    setLanguage,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("");

  const [
    selectedContactIds,
    setSelectedContactIds,
  ] =
    useState<string[]>([]);

  const [
    assignDialogOpen,
    setAssignDialogOpen,
  ] =
    useState(false);

  const {
    data:
      contactsResponse,

    isLoading:
      contactsLoading,

    isFetching:
      contactsFetching,

    isError:
      contactsError,
  } =
    useContacts({
      page,
      limit,

      search:
        appliedSearch ||
        undefined,

      language:
        language ||
        undefined,

      status:
        status ||
        undefined,
    });

  const {
    data:
      statistics,

    isLoading:
      statisticsLoading,

    isError:
      statisticsError,
  } =
    useContactStats();

  const contacts =
    contactsResponse?.data ??
    [];

  const meta =
    contactsResponse?.meta ?? {
      page,
      limit,
      total:
        0,
      totalPages:
        0,
    };

  function handleSearch(): void {
    setPage(
      DEFAULT_PAGE
    );

    setAppliedSearch(
      searchInput.trim()
    );

    setSelectedContactIds(
      []
    );
  }

  function handleLanguageChange(
    value: string
  ): void {
    setLanguage(
      value
    );

    setPage(
      DEFAULT_PAGE
    );

    setSelectedContactIds(
      []
    );
  }

  function handleStatusChange(
    value: string
  ): void {
    setStatus(
      value
    );

    setPage(
      DEFAULT_PAGE
    );

    setSelectedContactIds(
      []
    );
  }

  function handleReset(): void {
    setSearchInput(
      ""
    );

    setAppliedSearch(
      ""
    );

    setLanguage(
      ""
    );

    setStatus(
      ""
    );

    setPage(
      DEFAULT_PAGE
    );

    setLimit(
      DEFAULT_LIMIT
    );

    setSelectedContactIds(
      []
    );
  }

  function handleLimitChange(
    nextLimit: number
  ): void {
    setLimit(
      nextLimit
    );

    setPage(
      DEFAULT_PAGE
    );

    setSelectedContactIds(
      []
    );
  }

  function handlePageChange(
    nextPage: number
  ): void {
    setPage(
      nextPage
    );
  }

  function handleAssignToCampaign(): void {
    if (
      selectedContactIds.length ===
      0
    ) {
      return;
    }

    setAssignDialogOpen(
      true
    );
  }

  function handleAssignmentCompleted(): void {
    setSelectedContactIds(
      []
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="
          flex
          flex-col
          gap-4
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <div>
          <h1
            className="
              text-3xl
              font-bold
            "
          >
            Contacts
          </h1>

          <p className="text-muted-foreground">
            Manage your contact database
          </p>
        </div>

        <div
          className="
            flex
            flex-wrap
            gap-3
          "
        >
          <UploadCSV />

          <ContactForm />
        </div>
      </div>

      {statisticsError ? (
        <div
          className="
            rounded-xl
            border
            border-destructive/30
            bg-destructive/5
            p-4
            text-sm
            text-destructive
          "
        >
          Unable to load contact statistics.
        </div>
      ) : (
        <ContactStats
          statistics={
            statistics ?? {
              total:
                0,

              pending:
                0,

              called:
                0,

              failed:
                0,
            }
          }
          loading={
            statisticsLoading
          }
        />
      )}

      <ContactFilters
        search={
          searchInput
        }
        language={
          language
        }
        status={
          status
        }
        isLoading={
          contactsFetching
        }
        onSearchChange={
          setSearchInput
        }
        onLanguageChange={
          handleLanguageChange
        }
        onStatusChange={
          handleStatusChange
        }
        onSearch={
          handleSearch
        }
        onReset={
          handleReset
        }
      />

      <ContactBulkActions
        selectedCount={
          selectedContactIds.length
        }
        onAssignToCampaign={
          handleAssignToCampaign
        }
        onClearSelection={() =>
          setSelectedContactIds(
            []
          )
        }
      />

      <ContactTable
        contacts={
          contacts
        }
        selectedContactIds={
          selectedContactIds
        }
        isLoading={
          contactsLoading
        }
        isError={
          contactsError
        }
        onSelectionChange={
          setSelectedContactIds
        }
      />

      <Pagination
        page={
          meta.page
        }
        limit={
          meta.limit
        }
        total={
          meta.total
        }
        totalPages={
          meta.totalPages
        }
        isLoading={
          contactsFetching
        }
        onPageChange={
          handlePageChange
        }
        onLimitChange={
          handleLimitChange
        }
      />

      <AssignCampaignDialog
        open={
          assignDialogOpen
        }
        contactIds={
          selectedContactIds
        }
        onOpenChange={
          setAssignDialogOpen
        }
        onAssigned={
          handleAssignmentCompleted
        }
      />
    </div>
  );
}