"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import {
  Disc,
  Download,
  Headphones,
  Pause,
  Play,
  RefreshCw,
  Search,
  Volume2,
} from "lucide-react";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Button,
  buttonVariants,
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Input,
} from "@/components/ui/input";

import {
  type ColumnDef,
} from "@tanstack/react-table";

import {
  DataTable,
} from "@/components/ui/data-table/data-table";

type CallStatus =
  | "QUEUED"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELED";

type RecordingStatus =
  | "NOT_STARTED"
  | "REQUESTED"
  | "STARTED"
  | "AVAILABLE"
  | "FAILED";

type RecordedCallRow = {
  id: string;
  providerCallId: string | null;
  status: CallStatus;
  direction?: "INBOUND" | "OUTBOUND" | null;
  provider?: string | null;
  language: string;
  duration: number | null;
  hasRecording: boolean;
  recordingStatus?: RecordingStatus | null;
  recordingAvailableAt?: string | null;
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

type CallsApiResponse = {
  success: boolean;
  data?: RecordedCallRow[];
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

const RECORDING_STATUS_OPTIONS = [
  { value: "", label: "All recording states" },
  { value: "AVAILABLE", label: "Available" },
  { value: "STARTED", label: "Processing (Started)" },
  { value: "REQUESTED", label: "Requested" },
  { value: "FAILED", label: "Failed" },
  { value: "NOT_STARTED", label: "Not recorded" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function getRecordingStatusBadge(status?: RecordingStatus | null, hasRecording?: boolean) {
  const effective = status ?? (hasRecording ? "AVAILABLE" : "NOT_STARTED");
  switch (effective) {
    case "AVAILABLE":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30">
          Available
        </Badge>
      );
    case "STARTED":
    case "REQUESTED":
      return (
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 border-amber-500/30 animate-pulse">
          Processing
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive">
          Recording Failed
        </Badge>
      );
    case "NOT_STARTED":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not Recorded
        </Badge>
      );
  }
}

export default function CallRecordingsPage() {
  const [calls, setCalls] = useState<RecordedCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [recordingStatusFilter, setRecordingStatusFilter] = useState("");

  const [activePlayingCallId, setActivePlayingCallId] = useState<string | null>(null);

  const loadRecordings = useCallback(
    async (isManualRefresh = false): Promise<void> => {
      try {
        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });

        if (search) {
          params.set("search", search);
        }

        if (recordingStatusFilter) {
          params.set("recordingStatus", recordingStatusFilter);
        } else {
          // By default on recordings page, focus on calls that have had recording requested or completed
          params.set("hasRecording", "true");
        }

        const response = await fetch(`/api/calls?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const result = (await response.json()) as CallsApiResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.message ?? "Unable to load recordings");
        }

        setCalls(result.data);
        setTotal(result.meta?.total ?? result.data.length);
        setTotalPages(result.meta?.totalPages ?? 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load recordings");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, search, recordingStatusFilter]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecordings();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadRecordings]);

  function applySearch(): void {
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearFilters(): void {
    setSearchInput("");
    setSearch("");
    setRecordingStatusFilter("");
    setPage(1);
  }

  const stats = useMemo(() => {
    const availableCount = calls.filter(
      c => c.hasRecording || c.recordingStatus === "AVAILABLE"
    ).length;
    const processingCount = calls.filter(
      c => c.recordingStatus === "REQUESTED" || c.recordingStatus === "STARTED"
    ).length;
    const failedCount = calls.filter(c => c.recordingStatus === "FAILED").length;

    return {
      availableCount,
      processingCount,
      failedCount,
    };
  }, [calls]);

  const columns = useMemo<ColumnDef<RecordedCallRow>[]>(
    () => [
      {
        accessorKey: "contact",
        header: "Customer / Caller",
        cell: ({ row }) => {
          const contact = row.original.contact;
          const phone =
            contact?.phone ??
            row.original.contactPhoneSnapshot ??
            row.original.providerDestination ??
            "—";

          return (
            <div>
              <p className="font-semibold text-sm">
                {contact?.fullName ?? "Inbound caller"}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {phone}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "direction",
        header: "Direction / Provider",
        cell: ({ row }) => {
          const direction = row.original.direction ?? "OUTBOUND";
          const provider = row.original.provider ?? "PLIVO";
          const runtime = row.original.requestedRuntime ?? row.original.effectiveRuntime;

          return (
            <div className="flex flex-col gap-1 items-start">
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={
                    direction === "INBOUND"
                      ? "border-sky-500/40 text-sky-700 bg-sky-500/10"
                      : "border-purple-500/40 text-purple-700 bg-purple-500/10"
                  }
                >
                  {direction}
                </Badge>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {provider}
                </Badge>
              </div>
              {runtime && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {runtime}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "campaign.name",
        header: "Campaign",
        cell: ({ row }) => {
          const campaign = row.original.campaign;
          return (
            <div>
              <p className="font-medium text-sm">
                {campaign?.name ?? "Direct inbound"}
              </p>
              <p className="text-xs text-muted-foreground">
                {campaign?.language ?? row.original.language}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "recordingStatus",
        header: "Recording Status",
        cell: ({ row }) => (
          <div>
            {getRecordingStatusBadge(
              row.original.recordingStatus,
              row.original.hasRecording
            )}
            {row.original.recordingAvailableAt && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Avail: {formatDate(row.original.recordingAvailableAt)}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "duration",
        header: "Duration",
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {formatDuration(row.original.duration)}
          </span>
        ),
      },
      {
        accessorKey: "requestedAt",
        header: "Call Time",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.requestedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Playback & Actions",
        cell: ({ row }) => {
          const call = row.original;
          const isAvailable = call.hasRecording || call.recordingStatus === "AVAILABLE";
          const isProcessing =
            call.recordingStatus === "REQUESTED" || call.recordingStatus === "STARTED";
          const isFailed = call.recordingStatus === "FAILED";
          const isPlaying = activePlayingCallId === call.id;

          return (
            <div className="space-y-2 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-1.5">
                {isAvailable ? (
                  <>
                    <Button
                      size="sm"
                      variant={isPlaying ? "default" : "outline"}
                      className="h-8 gap-1 text-xs"
                      onClick={() =>
                        setActivePlayingCallId(isPlaying ? null : call.id)
                      }
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="h-3.5 w-3.5" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Play
                        </>
                      )}
                    </Button>

                    <a
                      href={`/api/calls/${call.id}/recording?download=1`}
                      download={`call-${call.id}.mp3`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "h-8 gap-1 text-xs",
                      })}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Save
                    </a>
                  </>
                ) : isProcessing ? (
                  <span className="text-xs text-amber-600 font-medium animate-pulse flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Processing recording…
                  </span>
                ) : isFailed ? (
                  <span className="text-xs text-destructive font-medium">
                    Recording failed
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not recorded
                  </span>
                )}

                <Link
                  href={`/calls/${call.id}`}
                  className="text-xs text-primary hover:underline ml-auto font-medium"
                >
                  Details
                </Link>
              </div>

              {isAvailable && isPlaying && (
                <div className="pt-1">
                  <audio
                    controls
                    autoPlay
                    preload="metadata"
                    className="w-full h-8 scale-95 origin-left"
                    src={`/api/calls/${call.id}/recording`}
                  >
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [activePlayingCallId]
  );

  return (
    <div className="min-h-screen space-y-6 p-4 md:p-6 xl:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Call Recordings
            </h1>
            <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-500/10">
              Audio Vault
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Listen to, download, and review audio recordings from inbound and outbound calls.
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
              bg-primary
              px-4
              text-sm
              font-medium
              text-primary-foreground
              shadow
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
            disabled={refreshing}
            onClick={() => void loadRecordings(true)}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Recorded</span>
              <Disc className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">Across all campaigns and inbound</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Available Playback</span>
              <Volume2 className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats.availableCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Ready for browser streaming & download</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Processing</span>
              <RefreshCw className="h-4 w-4 text-amber-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.processingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting provider callback</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Failed Records</span>
              <Headphones className="h-4 w-4 text-rose-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rose-600">{stats.failedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Operational failure evidence</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search & Filter Recordings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_240px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                placeholder="Search customer, phone, campaign, call UUID..."
                className="pl-9"
                onChange={event => setSearchInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    applySearch();
                  }
                }}
              />
            </div>

            <select
              value={recordingStatusFilter}
              onChange={event => {
                setRecordingStatusFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {RECORDING_STATUS_OPTIONS.map(option => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <Button onClick={applySearch}>Search</Button>
              <Button variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recordings Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recorded Calls</CardTitle>

          <select
            value={limit}
            onChange={event => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
          </select>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              Loading call recordings...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : calls.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground text-center p-6">
              <Disc className="h-8 w-8 text-muted-foreground/50 mb-1" />
              <p className="font-semibold text-foreground">No call recordings found</p>
              <p className="text-xs max-w-sm">
                Recordings will appear here once live inbound or outbound calls are initiated and processed.
              </p>
            </div>
          ) : (
            <DataTable columns={columns} data={calls} />
          )}

          {/* Pagination */}
          <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {totalPages === 0 ? 0 : page} of {totalPages} · {total} total recorded calls
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                Previous
              </Button>

              <Button
                variant="outline"
                disabled={totalPages === 0 || page >= totalPages || loading}
                onClick={() => setPage(current => current + 1)}
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
