//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_SCHEDULE_AHEAD_MS =
  30 *
  24 *
  60 *
  60 *
  1000;

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface OutboundScheduleDecision {
  scheduled:
    boolean;

  scheduledAt:
    Date | null;

  delayMs:
    number;

  shouldRunImmediately:
    boolean;
}

//--------------------------------------------------
// Resolve Schedule
//--------------------------------------------------

export function resolveOutboundSchedule(
  scheduledAt:
    Date | null | undefined,

  now:
    Date =
    new Date()
): OutboundScheduleDecision {
  //------------------------------------------------
  // Immediate Campaign
  //------------------------------------------------

  if (
    !scheduledAt
  ) {
    return {
      scheduled:
        false,

      scheduledAt:
        null,

      delayMs:
        0,

      shouldRunImmediately:
        true,
    };
  }

  //------------------------------------------------
  // Validate Date
  //------------------------------------------------

  const timestamp =
    scheduledAt.getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    throw new Error(
      "Campaign scheduledAt is invalid"
    );
  }

  const nowTimestamp =
    now.getTime();

  const requestedDelay =
    timestamp -
    nowTimestamp;

  //------------------------------------------------
  // Already Due
  //------------------------------------------------

  if (
    requestedDelay <=
    0
  ) {
    return {
      scheduled:
        false,

      scheduledAt,

      delayMs:
        0,

      shouldRunImmediately:
        true,
    };
  }

  //------------------------------------------------
  // Guard Excessive Delays
  //------------------------------------------------

  if (
    requestedDelay >
    MAX_SCHEDULE_AHEAD_MS
  ) {
    throw new Error(
      "Outbound campaign cannot be scheduled more than 30 days ahead"
    );
  }

  //------------------------------------------------
  // Delayed Campaign
  //------------------------------------------------

  return {
    scheduled:
      true,

    scheduledAt,

    delayMs:
      Math.floor(
        requestedDelay
      ),

    shouldRunImmediately:
      false,
  };
}