"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  ColumnDef,
} from "@tanstack/react-table";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Button,
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  DataTable,
} from "@/components/ui/data-table/data-table";

import {
  Input,
} from "@/components/ui/input";

type CallStatus =
  | "QUEUED"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELED";

type CallRow = {
  id: string;
  providerCallId: string | null;
  status: CallStatus;
  direction?: "INBOUND" | "OUTBOUND" | null;
  provider?: string | null;
  language: string;
  duration: number | null;
  hasRecording?: boolean;
  recordingStatus?: string | null;
  recordingAvailableAt?: string | null;
  recordingUrl?: string | null;
  requestedRuntime?: string | null;
  effectiveRuntime?: string | null;
  summary: string | null;
  contactPhoneSnapshot: string | null;
  providerDestination: string | null;
  usedDevelopmentOverride: boolean;
  requestedAt: string;
  queuedAt: string | null;
  ringingAt: string | null;
  answeredAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;

  contact: {
    id: string;
    fullName: string;
    phone: string;
    language: string;
    status: string;
  } | null;

  campaign: {
    id: string;
    name: string;
    status: string;
    language: string;
  } | null;

  campaignRun: {
    id: string;
    status: string;
  } | null;

  analysis: {
    intent: string | null;
    sentiment: string | null;
    priority: string | null;
    followUp: boolean;
  } | null;
};

type CallsResponse = {
  success: boolean;
  data?: CallRow[];

  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };

  message?: string;
};

const CALL_STATUSES: Array<{
  label: string;
  value: "" | CallStatus;
}> = [
  {
    label: "All statuses",
    value: "",
  },
  {
    label: "Queued",
    value: "QUEUED",
  },
  {
    label: "Ringing",
    value: "RINGING",
  },
  {
    label: "Answered",
    value: "ANSWERED",
  },
  {
    label: "Completed",
    value: "COMPLETED",
  },
  {
    label: "Failed",
    value: "FAILED",
  },
  {
    label: "Busy",
    value: "BUSY",
  },
  {
    label: "No Answer",
    value: "NO_ANSWER",
  },
  {
    label: "Canceled",
    value: "CANCELED",
  },
];

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  );
}

function formatDuration(
  seconds: number | null
): string {
  if (
    seconds === null ||
    seconds === undefined
  ) {
    return "—";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function getStatusVariant(
  status: CallStatus
):
  | "default"
  | "secondary"
  | "destructive"
  | "outline" {
  switch (status) {
    case "COMPLETED":
    case "ANSWERED":
      return "default";

    case "FAILED":
    case "BUSY":
    case "NO_ANSWER":
    case "CANCELED":
      return "destructive";

    case "QUEUED":
    case "RINGING":
      return "secondary";

    default:
      return "outline";
  }
}

export default function CallsPage() {
  const [
    calls,
    setCalls,
  ] =
    useState<CallRow[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(null);

  const [
    searchInput,
    setSearchInput,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState<"" | CallStatus>("");

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    limit,
    setLimit,
  ] =
    useState(10);

  const [
    total,
    setTotal,
  ] =
    useState(0);

  const [
    totalPages,
    setTotalPages,
  ] =
    useState(0);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const loadCalls =
    useCallback(
      async (
        isRefresh = false
      ): Promise<void> => {
        try {
          if (isRefresh) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setError(null);

          const params =
            new URLSearchParams({
              page:
                String(page),

              limit:
                String(limit),
            });

          if (search) {
            params.set(
              "search",
              search
            );
          }

          if (status) {
            params.set(
              "status",
              status
            );
          }

          const response =
            await fetch(
              `/api/calls?${params.toString()}`,
              {
                cache:
                  "no-store",
              }
            );

          const result =
            await response.json() as CallsResponse;

          if (
            !response.ok ||
            !result.success ||
            !result.data ||
            !result.meta
          ) {
            throw new Error(
              result.message ??
                "Unable to load calls"
            );
          }

          setCalls(
            result.data
          );

          setTotal(
            result.meta.total
          );

          setTotalPages(
            result.meta.totalPages
          );
        } catch (fetchError) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load calls"
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        limit,
        page,
        search,
        status,
      ]
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void loadCalls();
          },
          0
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      loadCalls,
    ]
  );

  const columns =
    useMemo<
      ColumnDef<CallRow>[]
    >(
      () => [
        {
          accessorKey:
            "contact.fullName",

          header:
            "Customer",

          cell:
            ({
              row,
            }) => {
              const contact = row.original.contact;
              const displayName = contact?.fullName ?? "Inbound caller";
              const displayPhone =
                contact?.phone ??
                row.original.contactPhoneSnapshot ??
                row.original.providerDestination ??
                "—";
              return (
                <div>
                  <p className="font-medium">
                    {displayName}
                  </p>

                  <p
                    className="
                      text-xs
                      text-muted-foreground
                    "
                  >
                    {displayPhone}
                  </p>
                </div>
              );
            },
        },

        {
          accessorKey:
            "campaign.name",

          header:
            "Campaign",

          cell:
            ({
              row,
            }) => {
              const campaign = row.original.campaign;
              return (
                <div>
                  <p className="font-medium">
                    {campaign?.name ?? "Direct inbound"}
                  </p>

                  <p
                    className="
                      text-xs
                      text-muted-foreground
                    "
                  >
                    {campaign?.language ?? "—"}
                  </p>
                </div>
              );
            },
        },

        {
          accessorKey:
            "status",

          header:
            "Status",

          cell:
            ({
              row,
            }) => (
              <Badge
                variant={
                  getStatusVariant(
                    row.original.status
                  )
                }
              >
                {
                  row.original
                    .status
                }
              </Badge>
            ),
        },

        {
          accessorKey:
            "duration",

          header:
            "Duration",

          cell:
            ({
              row,
            }) =>
              formatDuration(
                row.original.duration
              ),
        },

        {
          accessorKey:
            "analysis.intent",

          header:
            "Intent",

          cell:
            ({
              row,
            }) => (
              <div className="max-w-[220px]">
                <p
                  className="
                    truncate
                    text-sm
                  "
                  title={
                    row.original
                      .analysis
                      ?.intent ??
                    undefined
                  }
                >
                  {row.original
                    .analysis
                    ?.intent ??
                    "Not analyzed"}
                </p>

                {row.original
                  .analysis
                  ?.followUp && (
                  <Badge
                    variant="outline"
                    className="mt-1"
                  >
                    Follow-up
                  </Badge>
                )}
              </div>
            ),
        },

        {
          accessorKey:
            "requestedAt",

          header:
            "Requested",

          cell:
            ({
              row,
            }) =>
              formatDate(
                row.original.requestedAt
              ),
        },

        {
          accessorKey:
            "completedAt",

          header:
            "Completed",

          cell:
            ({
              row,
            }) =>
              formatDate(
                row.original.completedAt
              ),
        },

        {
          id:
            "actions",

          header:
            "Actions",

          cell:
            ({
              row,
            }) => (
              <Link
                href={`/calls/${row.original.id}`}
                className="
                  inline-flex
                  h-9
                  items-center
                  justify-center
                  rounded-md
                  border
                  border-input
                  bg-background
                  px-3
                  text-sm
                  font-medium
                  transition-colors
                  hover:bg-accent
                  hover:text-accent-foreground
                "
              >
                View Details
              </Link>
            ),
        },
      ],
      []
    );

  function applySearch(): void {
    setPage(1);

    setSearch(
      searchInput.trim()
    );
  }

  function clearFilters(): void {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPage(1);
  }

  return (
    <div
      className="
        min-h-screen
        space-y-6
        p-4
        md:p-6
        xl:p-8
      "
    >
      <div
        className="
          flex
          flex-col
          gap-4
          lg:flex-row
          lg:items-center
          lg:justify-between
        "
      >
        <div>
          <h1
            className="
              text-2xl
              font-bold
              tracking-tight
              md:text-3xl
            "
          >
            Calls
          </h1>

          <p
            className="
              mt-2
              text-sm
              text-muted-foreground
            "
          >
            Review call statuses, customer details,
            AI analysis, and completed conversations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/calls"
            className="
              inline-flex
              h-10
              items-center
              justify-center
              rounded-md
              bg-primary
              px-4
              text-sm
              font-medium
              text-primary-foreground
              shadow
            "
          >
            All Calls
          </Link>

          <Link
            href="/calls/recordings"
            className="
              inline-flex
              h-10
              items-center
              justify-center
              rounded-md
              border
              border-input
              bg-background
              px-4
              text-sm
              font-medium
              transition-colors
              hover:bg-accent
              hover:text-accent-foreground
            "
          >
            Recordings
          </Link>

          <Link
            href="/dashboard"
            className="
              inline-flex
              h-10
              items-center
              justify-center
              rounded-md
              border
              border-input
              bg-background
              px-4
              text-sm
              font-medium
              transition-colors
              hover:bg-accent
              hover:text-accent-foreground
            "
          >
            Dashboard
          </Link>

          <Button
            variant="outline"
            disabled={
              refreshing
            }
            onClick={
              () =>
                void loadCalls(
                  true
                )
            }
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </Button>
        </div>
      </div>

      <div
        className="
          grid
          gap-4
          sm:grid-cols-2
          xl:grid-cols-4
        "
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle
              className="
                text-sm
                font-medium
                text-muted-foreground
              "
            >
              Total Results
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-2xl font-bold">
              {total}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle
              className="
                text-sm
                font-medium
                text-muted-foreground
              "
            >
              Current Page
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-2xl font-bold">
              {totalPages === 0
                ? 0
                : page}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle
              className="
                text-sm
                font-medium
                text-muted-foreground
              "
            >
              Page Size
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-2xl font-bold">
              {limit}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle
              className="
                text-sm
                font-medium
                text-muted-foreground
              "
            >
              Active Filter
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p
              className="
                truncate
                text-lg
                font-semibold
              "
            >
              {status ||
                search ||
                "All calls"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Search and Filters
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            className="
              grid
              gap-4
              lg:grid-cols-[1fr_220px_auto]
            "
          >
            <Input
              value={
                searchInput
              }
              placeholder="Search customer, phone, campaign, call ID..."
              onChange={
                (
                  event
                ) =>
                  setSearchInput(
                    event.target.value
                  )
              }
              onKeyDown={
                (
                  event
                ) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    applySearch();
                  }
                }
              }
            />

            <select
              value={
                status
              }
              onChange={
                (
                  event
                ) => {
                  setStatus(
                    event.target.value as
                      | ""
                      | CallStatus
                  );

                  setPage(1);
                }
              }
              className="
                h-10
                rounded-md
                border
                border-input
                bg-background
                px-3
                text-sm
                outline-none
                focus:ring-2
                focus:ring-ring
              "
            >
              {CALL_STATUSES.map(
                (
                  option
                ) => (
                  <option
                    key={
                      option.value ||
                      "all"
                    }
                    value={
                      option.value
                    }
                  >
                    {
                      option.label
                    }
                  </option>
                )
              )}
            </select>

            <div className="flex gap-2">
              <Button
                onClick={
                  applySearch
                }
              >
                Search
              </Button>

              <Button
                variant="outline"
                onClick={
                  clearFilters
                }
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="
            flex
            flex-row
            items-center
            justify-between
          "
        >
          <CardTitle>
            Call Records
          </CardTitle>

          <select
            value={
              limit
            }
            onChange={
              (
                event
              ) => {
                setLimit(
                  Number(
                    event.target.value
                  )
                );

                setPage(1);
              }
            }
            className="
              h-9
              rounded-md
              border
              border-input
              bg-background
              px-3
              text-sm
            "
          >
            <option value="10">
              10 per page
            </option>

            <option value="20">
              20 per page
            </option>

            <option value="50">
              50 per page
            </option>
          </select>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div
              className="
                flex
                min-h-56
                items-center
                justify-center
                text-sm
                text-muted-foreground
              "
            >
              Loading calls...
            </div>
          ) : error ? (
            <div
              className="
                rounded-xl
                border
                border-destructive/30
                bg-destructive/5
                p-5
              "
            >
              <p className="text-sm text-destructive">
                {error}
              </p>
            </div>
          ) : calls.length === 0 ? (
            <div
              className="
                flex
                min-h-56
                items-center
                justify-center
                text-sm
                text-muted-foreground
              "
            >
              No calls matched the selected filters.
            </div>
          ) : (
            <DataTable
              columns={
                columns
              }
              data={
                calls
              }
            />
          )}

          <div
            className="
              mt-5
              flex
              flex-col
              gap-3
              border-t
              pt-4
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <p
              className="
                text-sm
                text-muted-foreground
              "
            >
              Page{" "}
              {totalPages === 0
                ? 0
                : page}{" "}
              of {totalPages}
              {" · "}
              {total} total calls
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={
                  page <= 1 ||
                  loading
                }
                onClick={
                  () =>
                    setPage(
                      (
                        current
                      ) =>
                        Math.max(
                          1,
                          current - 1
                        )
                    )
                }
              >
                Previous
              </Button>

              <Button
                variant="outline"
                disabled={
                  totalPages === 0 ||
                  page >= totalPages ||
                  loading
                }
                onClick={
                  () =>
                    setPage(
                      (
                        current
                      ) =>
                        current + 1
                    )
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}