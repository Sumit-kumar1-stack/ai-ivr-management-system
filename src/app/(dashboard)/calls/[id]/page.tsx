"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
} from "next/navigation";

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

type ConversationRole =
  | "SYSTEM"
  | "USER"
  | "ASSISTANT";

type CallStatus =
  | "QUEUED"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELED";

type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
};

type TimelineEvent = {
  id: string;
  type: string;
  message: string | null;
  payload: unknown;
  metadata: unknown;
  createdAt: string;
};

type RetryAttempt = {
  id: string;
  status: CallStatus;
  attemptNumber: number;
  maximumAttempts: number;
  retryReason: string | null;
  nextRetryAt: string | null;
  providerCallId: string | null;
  duration: number | null;

  lifecycle: {
    requestedAt: string | null;
    queuedAt: string | null;
    ringingAt: string | null;
    answeredAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    createdAt: string;
  };
};

type PreviousRetryAttempt = {
  id: string;
  status: CallStatus;
  attemptNumber: number;
  retryReason: string | null;
  nextRetryAt: string | null;
  requestedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
};

type CallDetails = {
  id: string;
  providerCallId: string | null;
  status: CallStatus;
  language: string;
  duration: number | null;

  attempt: {
    number: number;
    maximum: number;
    isRetry: boolean;
    retryReason: string | null;
    nextRetryAt: string | null;
    retryOfCallId: string | null;
    retriesCreated: number;
  };

  hasRecording: boolean;
  transcript: string | null;
  summary: string | null;

  phone: {
    contactPhoneSnapshot:
      string | null;

    providerDestination:
      string | null;

    usedDevelopmentOverride:
      boolean;

    destinationOverrideSource:
      string | null;
  };

  lifecycle: {
    requestedAt:
      string | null;

    queuedAt:
      string | null;

    ringingAt:
      string | null;

    answeredAt:
      string | null;

    completedAt:
      string | null;

    failedAt:
      string | null;

    startedAt:
      string | null;

    endedAt:
      string | null;

    createdAt:
      string;

    updatedAt:
      string;
  };

  contact: {
    id: string;
    fullName: string;
    phone: string;
    language: string;
    status: string;
    createdAt: string;
  };

  campaign: {
    id: string;
    name: string;
    description: string | null;
    language: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };

  campaignRun: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  } | null;

  retryHistory: {
    previousAttempt:
      PreviousRetryAttempt |
      null;

    followingAttempts:
      RetryAttempt[];
  };

  conversation: {
    id: string;
    summary: string | null;
    intent: string | null;
    sentiment: string | null;
    priority: string | null;
    followUp: boolean;
    actionItems: unknown;
    tokenUsage: number;
    createdAt: string;
    updatedAt: string;
    messages:
      ConversationMessage[];
  } | null;

  timeline:
    TimelineEvent[];
};

type CallDetailsResponse = {
  success: boolean;
  data?: CallDetails;
  message?: string;
};

function formatDate(
  value:
    | string
    | null
    | undefined
): string {
  if (!value) {
    return "Not available";
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
      dateStyle:
        "medium",

      timeStyle:
        "medium",
    }
  );
}

function formatDuration(
  seconds:
    | number
    | null
): string {
  if (
    seconds === null ||
    seconds === undefined
  ) {
    return "Not available";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  return `${minutes} min ${remainingSeconds} sec`;
}

function getStatusVariant(
  status: string
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

function getRoleLabel(
  role: ConversationRole
): string {
  switch (role) {
    case "USER":
      return "Customer";

    case "ASSISTANT":
      return "AI Agent";

    case "SYSTEM":
      return "System";

    default:
      return role;
  }
}

function getActionItems(
  value: unknown
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item ===
        "string" &&
      Boolean(
        item.trim()
      )
  );
}

function getTimelineLabel(
  event: TimelineEvent
): string {
  if (event.message) {
    switch (event.message) {
      case "conversation.message":
        return "Conversation message";

      case "conversation.analysis":
        return "Conversation analysis";

      case "voice.thinking":
        return "AI thinking";

      case "voice.speaking":
        return "AI speaking";

      case "voice.listening":
        return "AI listening";

      default:
        return event.message;
    }
  }

  return event.type;
}

function getTimelineDescription(
  event: TimelineEvent
): string | null {
  if (
    !event.payload ||
    typeof event.payload !==
      "object"
  ) {
    return null;
  }

  const payload =
    event.payload as Record<
      string,
      unknown
    >;

  if (
    typeof payload.text ===
      "string" &&
    payload.text.trim()
  ) {
    const role =
      typeof payload.role ===
      "string"
        ? payload.role
        : null;

    if (role === "USER") {
      return `Customer: ${payload.text}`;
    }

    if (role === "ASSISTANT") {
      return `AI Agent: ${payload.text}`;
    }

    return payload.text;
  }

  if (
    typeof payload.status ===
      "string"
  ) {
    return payload.status;
  }

  const analysis =
    payload.analysis;

  if (
    analysis &&
    typeof analysis ===
      "object"
  ) {
    const analysisRecord =
      analysis as Record<
        string,
        unknown
      >;

    if (
      typeof analysisRecord.summary ===
      "string"
    ) {
      return analysisRecord.summary;
    }
  }

  return null;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number
    | null
    | undefined;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-white/10
        bg-white/5
        p-4
      "
    >
      <p
        className="
          text-xs
          font-medium
          uppercase
          tracking-wide
          text-muted-foreground
        "
      >
        {label}
      </p>

      <p
        className="
          mt-2
          break-words
          text-sm
          font-medium
        "
      >
        {value ??
          "Not available"}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 p-6">
      <div
        className="
          h-12
          animate-pulse
          rounded-xl
          bg-muted
        "
      />

      <div
        className="
          grid
          gap-4
          md:grid-cols-2
          xl:grid-cols-4
        "
      >
        {Array.from({
          length: 4,
        }).map(
          (
            _,
            index
          ) => (
            <div
              key={index}
              className="
                h-32
                animate-pulse
                rounded-2xl
                bg-muted
              "
            />
          )
        )}
      </div>

      <div
        className="
          h-80
          animate-pulse
          rounded-2xl
          bg-muted
        "
      />
    </div>
  );
}

export default function CallDetailsPage() {
  const params =
    useParams<{
      id: string;
    }>();

  const callId =
    params.id;

  const [
    call,
    setCall,
  ] =
    useState<CallDetails | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const actionItems =
    useMemo(
      () =>
        getActionItems(
          call
            ?.conversation
            ?.actionItems
        ),
      [
        call,
      ]
    );

  useEffect(
    () => {
      if (!callId) {
        return;
      }

      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          () => {
            async function loadCallDetails(): Promise<void> {
              try {
                setLoading(true);
                setError(null);

                const response =
                  await fetch(
                    `/api/calls/${encodeURIComponent(
                      callId
                    )}`,
                    {
                      method:
                        "GET",

                      cache:
                        "no-store",

                      signal:
                        controller.signal,
                    }
                  );

                const result =
                  await response.json() as
                    CallDetailsResponse;

                if (
                  !response.ok ||
                  !result.success ||
                  !result.data
                ) {
                  throw new Error(
                    result.message ??
                      "Unable to load call details"
                  );
                }

                setCall(
                  result.data
                );
              } catch (fetchError) {
                if (
                  fetchError instanceof
                    DOMException &&
                  fetchError.name ===
                    "AbortError"
                ) {
                  return;
                }

                setError(
                  fetchError instanceof
                    Error
                    ? fetchError.message
                    : "Unable to load call details"
                );
              } finally {
                if (
                  !controller.signal.aborted
                ) {
                  setLoading(false);
                }
              }
            }

            void loadCallDetails();
          },
          0
        );

      return () => {
        window.clearTimeout(
          timer
        );

        controller.abort();
      };
    },
    [
      callId,
    ]
  );

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (
    error ||
    !call
  ) {
    return (
      <div
        className="
          flex
          min-h-[60vh]
          items-center
          justify-center
          p-6
        "
      >
        <Card
          className="
            w-full
            max-w-xl
          "
        >
          <CardHeader>
            <CardTitle>
              Unable to load call
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <p
              className="
                text-sm
                text-muted-foreground
              "
            >
              {error ??
                "The requested call could not be found."}
            </p>

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
                py-2
                text-sm
                font-medium
                text-primary-foreground
                transition-colors
                hover:bg-primary/90
              "
            >
              Return to calls
            </Link>
          </CardContent>
        </Card>
      </div>
    );
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
          <div
            className="
              mb-3
              flex
              flex-wrap
              items-center
              gap-2
            "
          >
            <Badge
              variant={
                getStatusVariant(
                  call.status
                )
              }
            >
              {call.status}
            </Badge>

            <Badge variant="outline">
              {call.language}
            </Badge>

            {call.phone
              .usedDevelopmentOverride && (
              <Badge variant="secondary">
                Development Override
              </Badge>
            )}
          </div>

          <h1
            className="
              text-2xl
              font-bold
              tracking-tight
              md:text-3xl
            "
          >
            Call Details
          </h1>

          <p
            className="
              mt-2
              break-all
              text-sm
              text-muted-foreground
            "
          >
            {call.id}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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
            onClick={
              () =>
                window.location.reload()
            }
          >
            Refresh
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
              Customer
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-xl font-semibold">
              {call.contact.fullName}
            </p>

            <p
              className="
                mt-1
                text-sm
                text-muted-foreground
              "
            >
              {call.contact.phone}
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
              Campaign
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-xl font-semibold">
              {call.campaign.name}
            </p>

            <p
              className="
                mt-1
                text-sm
                text-muted-foreground
              "
            >
              {call.campaign.status}
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
              Duration
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-xl font-semibold">
              {formatDuration(
                call.duration
              )}
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
              Follow-up
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-xl font-semibold">
              {call.conversation
                ?.followUp
                ? "Required"
                : "Not required"}
            </p>
          </CardContent>
        </Card>
      </div>

      <TransferCallbackPanel callId={call.id} />

      <Card>
        <CardHeader>
          <CardTitle>
            Attempt and Retry Information
          </CardTitle>
        </CardHeader>

        <CardContent
          className="
            grid
            gap-4
            sm:grid-cols-2
            lg:grid-cols-3
            xl:grid-cols-4
          "
        >
          <DetailItem
            label="Attempt Number"
            value={`${call.attempt.number} of ${call.attempt.maximum}`}
          />

          <DetailItem
            label="Attempt Type"
            value={
              call.attempt.isRetry
                ? "Retry attempt"
                : "Initial attempt"
            }
          />

          <DetailItem
            label="Retry Reason"
            value={
              call.attempt.retryReason
            }
          />

          <DetailItem
            label="Next Retry"
            value={
              formatDate(
                call.attempt.nextRetryAt
              )
            }
          />

          <DetailItem
            label="Following Retries"
            value={
              call.attempt.retriesCreated
            }
          />

          <DetailItem
            label="Previous Call ID"
            value={
              call.attempt.retryOfCallId
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            AI Conversation Analysis
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <div
            className="
              grid
              gap-4
              sm:grid-cols-2
              xl:grid-cols-4
            "
          >
            <DetailItem
              label="Intent"
              value={
                call.conversation
                  ?.intent
              }
            />

            <DetailItem
              label="Sentiment"
              value={
                call.conversation
                  ?.sentiment
              }
            />

            <DetailItem
              label="Priority"
              value={
                call.conversation
                  ?.priority
              }
            />

            <DetailItem
              label="Token Usage"
              value={
                call.conversation
                  ?.tokenUsage
              }
            />
          </div>

          <div
            className="
              rounded-xl
              border
              bg-muted/30
              p-5
            "
          >
            <p className="text-sm font-semibold">
              Summary
            </p>

            <p
              className="
                mt-3
                whitespace-pre-wrap
                text-sm
                leading-7
                text-muted-foreground
              "
            >
              {call.summary ??
                call.conversation
                  ?.summary ??
                "No summary generated."}
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">
              Action Items
            </p>

            {actionItems.length > 0 ? (
              <div className="space-y-2">
                {actionItems.map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={`${item}-${index}`}
                      className="
                        flex
                        gap-3
                        rounded-xl
                        border
                        bg-muted/20
                        p-4
                      "
                    >
                      <span
                        className="
                          flex
                          h-6
                          w-6
                          shrink-0
                          items-center
                          justify-center
                          rounded-full
                          border
                          text-xs
                          font-semibold
                        "
                      >
                        {index + 1}
                      </span>

                      <p className="text-sm leading-6">
                        {item}
                      </p>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p
                className="
                  text-sm
                  text-muted-foreground
                "
              >
                No action items were generated.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div
        className="
          grid
          gap-6
          xl:grid-cols-[1.4fr_1fr]
        "
      >
        <Card>
          <CardHeader>
            <CardTitle>
              Conversation
            </CardTitle>
          </CardHeader>

          <CardContent>
            {call.conversation &&
            call.conversation
              .messages.length > 0 ? (
              <div
                className="
                  max-h-[650px]
                  space-y-4
                  overflow-y-auto
                  pr-2
                "
              >
                {call.conversation
                  .messages.map(
                    (
                      message
                    ) => {
                      const isAssistant =
                        message.role ===
                        "ASSISTANT";

                      const isSystem =
                        message.role ===
                        "SYSTEM";

                      return (
                        <div
                          key={
                            message.id
                          }
                          className={`flex ${
                            isAssistant
                              ? "justify-start"
                              : message.role ===
                                  "USER"
                                ? "justify-end"
                                : "justify-center"
                          }`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl border p-4 ${
                              isAssistant
                                ? "bg-muted/40"
                                : isSystem
                                  ? "bg-muted/20"
                                  : "bg-primary text-primary-foreground"
                            }`}
                          >
                            <div
                              className="
                                mb-2
                                flex
                                flex-wrap
                                items-center
                                gap-2
                              "
                            >
                              <span className="text-xs font-semibold">
                                {getRoleLabel(
                                  message.role
                                )}
                              </span>

                              <span className="text-[11px] opacity-70">
                                {formatDate(
                                  message.createdAt
                                )}
                              </span>
                            </div>

                            <p
                              className="
                                whitespace-pre-wrap
                                text-sm
                                leading-6
                              "
                            >
                              {message.content}
                            </p>
                          </div>
                        </div>
                      );
                    }
                  )}
              </div>
            ) : (
              <p
                className="
                  text-sm
                  text-muted-foreground
                "
              >
                No conversation messages are available.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Call Timeline
            </CardTitle>
          </CardHeader>

          <CardContent>
            {call.timeline.length > 0 ? (
              <div
                className="
                  max-h-[650px]
                  space-y-0
                  overflow-y-auto
                  pr-2
                "
              >
                {call.timeline.map(
                  (
                    event,
                    index
                  ) => {
                    const description =
                      getTimelineDescription(
                        event
                      );

                    const isLast =
                      index ===
                      call.timeline.length -
                        1;

                    return (
                      <div
                        key={
                          event.id
                        }
                        className="
                          relative
                          flex
                          gap-4
                        "
                      >
                        <div
                          className="
                            flex
                            flex-col
                            items-center
                          "
                        >
                          <div
                            className="
                              mt-1
                              h-3
                              w-3
                              rounded-full
                              border-2
                              border-primary
                              bg-background
                            "
                          />

                          {!isLast && (
                            <div
                              className="
                                min-h-16
                                w-px
                                flex-1
                                bg-border
                              "
                            />
                          )}
                        </div>

                        <div className="flex-1 pb-6">
                          <div
                            className="
                              flex
                              flex-wrap
                              items-center
                              gap-2
                            "
                          >
                            <p className="text-sm font-semibold">
                              {getTimelineLabel(
                                event
                              )}
                            </p>

                            <Badge variant="outline">
                              {event.type}
                            </Badge>
                          </div>

                          {description && (
                            <p
                              className="
                                mt-2
                                text-sm
                                leading-6
                                text-muted-foreground
                              "
                            >
                              {description}
                            </p>
                          )}

                          <p
                            className="
                              mt-2
                              text-xs
                              text-muted-foreground
                            "
                          >
                            {formatDate(
                              event.createdAt
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <p
                className="
                  text-sm
                  text-muted-foreground
                "
              >
                No timeline events are available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div
        className="
          grid
          gap-6
          lg:grid-cols-2
        "
      >
        <Card>
          <CardHeader>
            <CardTitle>
              Customer Information
            </CardTitle>
          </CardHeader>

          <CardContent
            className="
              grid
              gap-4
              sm:grid-cols-2
            "
          >
            <DetailItem
              label="Full Name"
              value={
                call.contact.fullName
              }
            />

            <DetailItem
              label="Phone"
              value={
                call.contact.phone
              }
            />

            <DetailItem
              label="Language"
              value={
                call.contact.language
              }
            />

            <DetailItem
              label="Contact Status"
              value={
                call.contact.status
              }
            />

            <DetailItem
              label="Provider Destination"
              value={
                call.phone
                  .providerDestination
              }
            />

            <DetailItem
              label="Phone Snapshot"
              value={
                call.phone
                  .contactPhoneSnapshot
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Campaign Information
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div
              className="
                grid
                gap-4
                sm:grid-cols-2
              "
            >
              <DetailItem
                label="Campaign"
                value={
                  call.campaign.name
                }
              />

              <DetailItem
                label="Status"
                value={
                  call.campaign.status
                }
              />

              <DetailItem
                label="Language"
                value={
                  call.campaign.language
                }
              />

              <DetailItem
                label="Run Status"
                value={
                  call.campaignRun
                    ?.status
                }
              />
            </div>

            <div
              className="
                rounded-xl
                border
                bg-muted/20
                p-4
              "
            >
              <p
                className="
                  text-xs
                  font-medium
                  uppercase
                  tracking-wide
                  text-muted-foreground
                "
              >
                Description
              </p>

              <p className="mt-2 text-sm leading-6">
                {call.campaign.description ??
                  "No campaign description."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Retry History
          </CardTitle>
        </CardHeader>

        <CardContent>
          {!call.retryHistory.previousAttempt &&
          call.retryHistory.followingAttempts.length === 0 ? (
            <p
              className="
                text-sm
                text-muted-foreground
              "
            >
              This call has no retry history.
            </p>
          ) : (
            <div className="space-y-4">
              {call.retryHistory.previousAttempt && (
                <Link
                  href={`/calls/${call.retryHistory.previousAttempt.id}`}
                  className="
                    block
                    rounded-xl
                    border
                    bg-muted/20
                    p-4
                    transition-colors
                    hover:bg-muted/40
                  "
                >
                  <div
                    className="
                      flex
                      flex-wrap
                      items-center
                      justify-between
                      gap-3
                    "
                  >
                    <div>
                      <p className="font-semibold">
                        Previous attempt{" "}
                        {
                          call.retryHistory
                            .previousAttempt
                            .attemptNumber
                        }
                      </p>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-muted-foreground
                        "
                      >
                        {
                          call.retryHistory
                            .previousAttempt
                            .retryReason ??
                          "No retry reason recorded"
                        }
                      </p>
                    </div>

                    <Badge
                      variant={
                        getStatusVariant(
                          call.retryHistory
                            .previousAttempt
                            .status
                        )
                      }
                    >
                      {
                        call.retryHistory
                          .previousAttempt
                          .status
                      }
                    </Badge>
                  </div>
                </Link>
              )}

              {call.retryHistory.followingAttempts.map(
                retry => (
                  <Link
                    key={
                      retry.id
                    }
                    href={`/calls/${retry.id}`}
                    className="
                      block
                      rounded-xl
                      border
                      bg-muted/20
                      p-4
                      transition-colors
                      hover:bg-muted/40
                    "
                  >
                    <div
                      className="
                        flex
                        flex-wrap
                        items-center
                        justify-between
                        gap-3
                      "
                    >
                      <div>
                        <p className="font-semibold">
                          Retry attempt{" "}
                          {
                            retry.attemptNumber
                          }{" "}
                          of{" "}
                          {
                            retry.maximumAttempts
                          }
                        </p>

                        <p
                          className="
                            mt-1
                            text-sm
                            text-muted-foreground
                          "
                        >
                          {retry.retryReason ??
                            "No retry reason recorded"}
                        </p>

                        <p
                          className="
                            mt-1
                            text-xs
                            text-muted-foreground
                          "
                        >
                          Requested:{" "}
                          {formatDate(
                            retry.lifecycle
                              .requestedAt
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <Badge
                          variant={
                            getStatusVariant(
                              retry.status
                            )
                          }
                        >
                          {retry.status}
                        </Badge>

                        <p
                          className="
                            mt-2
                            text-xs
                            text-muted-foreground
                          "
                        >
                          {formatDuration(
                            retry.duration
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Lifecycle Timestamps
          </CardTitle>
        </CardHeader>

        <CardContent
          className="
            grid
            gap-4
            sm:grid-cols-2
            lg:grid-cols-3
            xl:grid-cols-4
          "
        >
          <DetailItem
            label="Requested"
            value={
              formatDate(
                call.lifecycle.requestedAt
              )
            }
          />

          <DetailItem
            label="Queued"
            value={
              formatDate(
                call.lifecycle.queuedAt
              )
            }
          />

          <DetailItem
            label="Ringing"
            value={
              formatDate(
                call.lifecycle.ringingAt
              )
            }
          />

          <DetailItem
            label="Answered"
            value={
              formatDate(
                call.lifecycle.answeredAt
              )
            }
          />

          <DetailItem
            label="Completed"
            value={
              formatDate(
                call.lifecycle.completedAt
              )
            }
          />

          <DetailItem
            label="Failed"
            value={
              formatDate(
                call.lifecycle.failedAt
              )
            }
          />

          <DetailItem
            label="Started"
            value={
              formatDate(
                call.lifecycle.startedAt
              )
            }
          />

          <DetailItem
            label="Ended"
            value={
              formatDate(
                call.lifecycle.endedAt
              )
            }
          />
        </CardContent>
      </Card>

      <div
        className="
          grid
          gap-6
          lg:grid-cols-2
        "
      >
        <Card>
          <CardHeader>
            <CardTitle>
              Recording
            </CardTitle>
          </CardHeader>

          <CardContent>
            {call.hasRecording ? (
  <div
    className="
      space-y-4
      rounded-xl
      border
      bg-muted/20
      p-4
    "
  >
    <p
      className="
        text-sm
        text-muted-foreground
      "
    >
      Listen to the recorded customer and AI conversation.
    </p>

    <audio
      controls
      preload="metadata"
      className="w-full"
      src={`/api/calls/${call.id}/recording`}
    >
      Your browser does not support audio playback.
    </audio>

    <a
      href={`/api/calls/${call.id}/recording?download=1`}
      className={buttonVariants({
        variant: "outline",
        size: "sm",
      })}
    >
      Download recording
    </a>
  </div>
) : (
              <p
                className="
                  text-sm
                  text-muted-foreground
                "
              >
                No recording is currently available for this call.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Technical Information
            </CardTitle>
          </CardHeader>

          <CardContent
            className="
              grid
              gap-4
              sm:grid-cols-2
            "
          >
            <DetailItem
              label="Call ID"
              value={
                call.id
              }
            />

            <DetailItem
              label="Provider Call ID"
              value={
                call.providerCallId
              }
            />

            <DetailItem
              label="Override Source"
              value={
                call.phone
                  .destinationOverrideSource
              }
            />

            <DetailItem
              label="Updated At"
              value={
                formatDate(
                  call.lifecycle.updatedAt
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type SafeTransferEvent = { createdAt: string; message: string | null; status: string | null; provider: string | null; handoff: { department: string | null; intent: string | null; conversationSummary: string | null } | null };
type SafeCallback = { id: string; status: string; phone: string; reason: string | null; intent: string | null; preferredStart: string; preferredEnd: string | null; timezone: string };

function TransferCallbackPanel({ callId }: { callId: string }) {
  const [data, setData] = useState<{ events: SafeTransferEvent[]; callbacks: SafeCallback[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/transfer`, { cache: "no-store" });
    const result = await response.json() as { success: boolean; data?: { events: SafeTransferEvent[]; callbacks: SafeCallback[] }; message?: string };
    if (!response.ok || !result.success || !result.data) throw new Error(result.message ?? "Unable to load transfer details");
    setData(result.data);
  }, [callId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Unable to load transfer details")); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const act = async (id: string, action: "confirm" | "claim" | "schedule" | "complete" | "fail" | "cancel") => {
    const response = await fetch(`/api/callbacks/${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const result = await response.json() as { success: boolean; message?: string };
    if (!response.ok || !result.success) { setMessage(result.message ?? "Unable to update callback"); return; }
    await load();
  };
  if (!data && !message) return null;
  return <Card><CardHeader><CardTitle>Human Transfer and Callback</CardTitle></CardHeader><CardContent className="space-y-5">
    {message && <p className="text-sm text-destructive">{message}</p>}
    {data?.events.length ? <div className="space-y-3">{data.events.map((event, index) => <div key={`${event.createdAt}-${index}`} className="rounded-xl border p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={getStatusVariant(event.status ?? "")}>{event.status ?? event.message ?? "Transfer"}</Badge>{event.provider && <Badge variant="outline">{event.provider}</Badge>}<span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span></div>{event.handoff && <p className="mt-3 text-sm">Department: {event.handoff.department ?? "Not specified"} · Intent: {event.handoff.intent ?? "Not specified"}<br />Safe handoff summary: {event.handoff.conversationSummary ?? "Not available"}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">No human-transfer activity for this call.</p>}
    {data?.callbacks.length ? <div className="space-y-3 border-t pt-5"><p className="text-sm font-semibold">Callbacks</p>{data.callbacks.map(callback => <div key={callback.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={getStatusVariant(callback.status)}>{callback.status}</Badge><span className="text-sm text-muted-foreground">{callback.phone}</span></div><p className="mt-2 text-sm">{callback.reason ?? callback.intent ?? "Callback follow-up"}</p><p className="mt-1 text-xs text-muted-foreground">Window: {formatDate(callback.preferredStart)}{callback.preferredEnd ? ` – ${formatDate(callback.preferredEnd)}` : ""} ({callback.timezone})</p>{!["COMPLETED", "FAILED", "CANCELLED"].includes(callback.status) && <div className="mt-3 flex flex-wrap gap-2">{(["confirm", "claim", "schedule", "complete", "fail", "cancel"] as const).map(action => <Button key={action} size="sm" variant={action === "cancel" || action === "fail" ? "outline" : "default"} onClick={() => void act(callback.id, action)}>{action}</Button>)}</div>}</div>)}</div> : null}
  </CardContent></Card>;
}
