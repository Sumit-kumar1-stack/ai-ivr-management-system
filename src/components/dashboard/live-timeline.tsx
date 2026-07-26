"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

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
  TimelineEvent,
  useDashboardStore,
} from "@/store/dashboard.store";

const SLIDE_INTERVAL_MS =
  4000;

function formatTime(
  timestamp: number
): string {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown time";
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

function formatEventName(
  event: string
): string {
  return event
    .replace(
      /[._-]/g,
      " "
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}

function getPayloadRecord(
  payload: unknown
): Record<
  string,
  unknown
> | null {
  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(
      payload
    )
  ) {
    return null;
  }

  return payload as Record<
    string,
    unknown
  >;
}

function getEventDescription(
  timelineEvent:
    TimelineEvent
): string {
  const payload =
    getPayloadRecord(
      timelineEvent.payload
    );

  if (!payload) {
    return "A new live call event was received.";
  }

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

    if (
      role === "USER"
    ) {
      return `Customer: ${payload.text}`;
    }

    if (
      role ===
      "ASSISTANT"
    ) {
      return `AI Agent: ${payload.text}`;
    }

    return payload.text;
  }

  if (
    typeof payload.status ===
      "string" &&
    payload.status.trim()
  ) {
    return payload.status;
  }

  if (
    typeof payload.summary ===
      "string" &&
    payload.summary.trim()
  ) {
    return payload.summary;
  }

  const analysis =
    getPayloadRecord(
      payload.analysis
    );

  if (
    analysis &&
    typeof analysis.summary ===
      "string"
  ) {
    return analysis.summary;
  }

  if (
    typeof payload.phone ===
      "string"
  ) {
    return `Phone: ${payload.phone}`;
  }

  return "A new live call event was received.";
}

function getCallId(
  timelineEvent:
    TimelineEvent
): string | null {
  if (
    timelineEvent.callId
  ) {
    return timelineEvent.callId;
  }

  const payload =
    getPayloadRecord(
      timelineEvent.payload
    );

  if (
    payload &&
    typeof payload.callId ===
      "string"
  ) {
    return payload.callId;
  }

  return null;
}

function getEventStyle(
  event: string
): string {
  const normalized =
    event.toUpperCase();

  if (
    normalized.includes(
      "FAILED"
    ) ||
    normalized.includes(
      "ERROR"
    )
  ) {
    return `
      border-red-200
      bg-red-50
      text-red-700
    `;
  }

  if (
    normalized.includes(
      "COMPLETED"
    )
  ) {
    return `
      border-green-200
      bg-green-50
      text-green-700
    `;
  }

  if (
    normalized.includes(
      "THINKING"
    )
  ) {
    return `
      border-amber-200
      bg-amber-50
      text-amber-700
    `;
  }

  if (
    normalized.includes(
      "SPEAKING"
    )
  ) {
    return `
      border-purple-200
      bg-purple-50
      text-purple-700
    `;
  }

  if (
    normalized.includes(
      "LISTENING"
    )
  ) {
    return `
      border-blue-200
      bg-blue-50
      text-blue-700
    `;
  }

  return `
    border-slate-200
    bg-slate-50
    text-slate-700
  `;
}

export default function LiveTimeline() {
  const timeline =
    useDashboardStore(
      (
        state
      ) =>
        state.timeline
    );

  const [
    currentIndex,
    setCurrentIndex,
  ] =
    useState(0);

  const [
    isPlaying,
    setIsPlaying,
  ] =
    useState(true);

  const visibleEvents =
    useMemo(
      () =>
        timeline.slice(
          0,
          20
        ),
      [
        timeline,
      ]
    );

  useEffect(
    () => {
      if (
        currentIndex >=
        visibleEvents.length
      ) {
        setCurrentIndex(
          0
        );
      }
    },
    [
      currentIndex,
      visibleEvents.length,
    ]
  );

  useEffect(
    () => {
      if (
        !isPlaying ||
        visibleEvents.length <=
          1
      ) {
        return;
      }

      const interval =
        window.setInterval(
          () => {
            setCurrentIndex(
              (
                current
              ) =>
                (
                  current +
                  1
                ) %
                visibleEvents.length
            );
          },
          SLIDE_INTERVAL_MS
        );

      return () => {
        window.clearInterval(
          interval
        );
      };
    },
    [
      isPlaying,
      visibleEvents.length,
    ]
  );

  function showPrevious(): void {
    if (
      visibleEvents.length ===
      0
    ) {
      return;
    }

    setCurrentIndex(
      (
        current
      ) =>
        current ===
        0
          ? visibleEvents.length -
            1
          : current -
            1
    );
  }

  function showNext(): void {
    if (
      visibleEvents.length ===
      0
    ) {
      return;
    }

    setCurrentIndex(
      (
        current
      ) =>
        (
          current +
          1
        ) %
        visibleEvents.length
    );
  }

  const currentEvent =
    visibleEvents[
      currentIndex
    ];

  return (
    <Card
      className="
        overflow-hidden
      "
    >
      <CardHeader
        className="
          flex
          flex-row
          items-center
          justify-between
          space-y-0
        "
      >
        <div>
          <CardTitle>
            Live Timeline
          </CardTitle>

          <p
            className="
              mt-1
              text-sm
              text-muted-foreground
            "
          >
            Latest AI IVR events
          </p>
        </div>

        <div
          className="
            flex
            items-center
            gap-2
          "
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={
              visibleEvents.length <=
              1
            }
            onClick={
              showPrevious
            }
            aria-label="Previous event"
          >
            <ChevronLeft
              className="
                h-4
                w-4
              "
            />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={
              visibleEvents.length <=
              1
            }
            onClick={
              () =>
                setIsPlaying(
                  (
                    current
                  ) =>
                    !current
                )
            }
            aria-label={
              isPlaying
                ? "Pause slideshow"
                : "Play slideshow"
            }
          >
            {isPlaying ? (
              <Pause
                className="
                  h-4
                  w-4
                "
              />
            ) : (
              <Play
                className="
                  h-4
                  w-4
                "
              />
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={
              visibleEvents.length <=
              1
            }
            onClick={
              showNext
            }
            aria-label="Next event"
          >
            <ChevronRight
              className="
                h-4
                w-4
              "
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {!currentEvent ? (
          <div
            className="
              flex
              min-h-64
              items-center
              justify-center
              rounded-2xl
              border
              border-dashed
              text-sm
              text-muted-foreground
            "
          >
            No live events available.
          </div>
        ) : (
          <div
            className="
              relative
              min-h-64
              overflow-hidden
              rounded-2xl
              border
              bg-muted/20
              p-6
            "
          >
            <div
              key={`${currentEvent.event}-${currentEvent.timestamp}`}
              className="
                animate-in
                fade-in
                slide-in-from-right-4
                duration-500
              "
            >
              <div
                className="
                  flex
                  flex-wrap
                  items-start
                  justify-between
                  gap-3
                "
              >
                <span
                  className={`
                    inline-flex
                    rounded-full
                    border
                    px-3
                    py-1
                    text-xs
                    font-semibold
                    ${getEventStyle(
                      currentEvent.event
                    )}
                  `}
                >
                  {formatEventName(
                    currentEvent.event
                  )}
                </span>

                <span
                  className="
                    text-xs
                    text-muted-foreground
                  "
                >
                  {currentIndex +
                    1}{" "}
                  /{" "}
                  {
                    visibleEvents.length
                  }
                </span>
              </div>

              <p
                className="
                  mt-6
                  min-h-20
                  text-lg
                  font-medium
                  leading-8
                "
              >
                {getEventDescription(
                  currentEvent
                )}
              </p>

              <div
                className="
                  mt-6
                  space-y-2
                  border-t
                  pt-4
                  text-sm
                  text-muted-foreground
                "
              >
                <div
                  className="
                    flex
                    justify-between
                    gap-4
                  "
                >
                  <span>
                    Time
                  </span>

                  <span
                    className="
                      text-right
                      font-medium
                      text-foreground
                    "
                  >
                    {formatTime(
                      currentEvent.timestamp
                    )}
                  </span>
                </div>

                <div
                  className="
                    flex
                    justify-between
                    gap-4
                  "
                >
                  <span>
                    Call ID
                  </span>

                  <span
                    className="
                      max-w-[220px]
                      truncate
                      text-right
                      font-mono
                      text-xs
                      text-foreground
                    "
                    title={
                      getCallId(
                        currentEvent
                      ) ??
                      undefined
                    }
                  >
                    {getCallId(
                      currentEvent
                    ) ??
                      "Not available"}
                  </span>
                </div>
              </div>
            </div>

            {isPlaying &&
              visibleEvents.length >
                1 && (
                <div
                  className="
                    absolute
                    bottom-0
                    left-0
                    h-1
                    w-full
                    overflow-hidden
                    bg-muted
                  "
                >
                  <div
                    key={
                      currentIndex
                    }
                    className="
                      h-full
                      origin-left
                      animate-[timeline-progress_4s_linear]
                      bg-primary
                    "
                  />
                </div>
              )}
          </div>
        )}

        {visibleEvents.length >
          1 && (
          <div
            className="
              mt-5
              flex
              flex-wrap
              justify-center
              gap-2
            "
          >
            {visibleEvents.map(
              (
                event,
                index
              ) => (
                <button
                  key={`${event.event}-${event.timestamp}-${index}`}
                  type="button"
                  onClick={
                    () =>
                      setCurrentIndex(
                        index
                      )
                  }
                  className={`
                    h-2.5
                    rounded-full
                    transition-all
                    ${
                      index ===
                      currentIndex
                        ? `
                          w-8
                          bg-primary
                        `
                        : `
                          w-2.5
                          bg-muted-foreground/30
                          hover:bg-muted-foreground/60
                        `
                    }
                  `}
                  aria-label={`Show timeline event ${
                    index +
                    1
                  }`}
                />
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}