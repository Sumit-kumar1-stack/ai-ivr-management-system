//--------------------------------------------------
// Types
//--------------------------------------------------

export interface HumanTransferPolicyDecision {
  allowed:
    boolean;

  destination:
    string | null;

  announcement:
    string | null;

  timeoutSeconds:
    number;

  reason:
    string | null;
}

//--------------------------------------------------
// Resolve Policy
//--------------------------------------------------

export function resolveHumanTransferPolicy():
  HumanTransferPolicyDecision {
  //------------------------------------------------
  // Enabled
  //------------------------------------------------

  const enabled =
    parseBoolean(
      process.env
        .HUMAN_TRANSFER_ENABLED,
      false
    );

  if (
    !enabled
  ) {
    return {
      allowed:
        false,

      destination:
        null,

      announcement:
        null,

      timeoutSeconds:
        30,

      reason:
        "Human transfer is disabled.",
    };
  }

  //------------------------------------------------
  // Optional Service Window
  //------------------------------------------------

  const timezone =
    process.env
      .HUMAN_TRANSFER_TIMEZONE
      ?.trim();

  const startHour =
    parseHour(
      process.env
        .HUMAN_TRANSFER_START_HOUR
    );

  const endHour =
    parseHour(
      process.env
        .HUMAN_TRANSFER_END_HOUR
    );

  if (
    timezone &&
    startHour !==
      null &&
    endHour !==
      null
  ) {
    if (
      !isWithinServiceWindow(
        timezone,
        startHour,
        endHour
      )
    ) {
      return {
        allowed:
          false,

        destination:
          null,

        announcement:
          null,

        timeoutSeconds:
          resolveTimeout(),

        reason:
          "Human agents are currently outside the configured service window.",
      };
    }
  }

  //------------------------------------------------
  // Allowed
  //------------------------------------------------

  return {
    allowed:
      true,

    // Selected tenant User records provide destinations at runtime; an
    // environment value must never route a customer call.
    destination: null,

    announcement:
      process.env
        .HUMAN_TRANSFER_ANNOUNCEMENT
        ?.trim() ||
      "Please hold while I connect your call.",

    timeoutSeconds:
      resolveTimeout(),

    reason:
      null,
  };
}

//--------------------------------------------------
// Timeout
//--------------------------------------------------

function resolveTimeout():
  number {
  const parsed =
    Number(
      process.env
        .HUMAN_TRANSFER_TIMEOUT_SECONDS
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 30;
  }

  return Math.min(
    120,
    Math.max(
      5,
      Math.round(
        parsed
      )
    )
  );
}

//--------------------------------------------------
// Boolean
//--------------------------------------------------

function parseBoolean(
  value:
    string |
    undefined,

  defaultValue:
    boolean
): boolean {
  if (
    value ===
    undefined
  ) {
    return defaultValue;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(
      normalized
    )
  ) {
    return false;
  }

  return defaultValue;
}

//--------------------------------------------------
// Hour
//--------------------------------------------------

function parseHour(
  value:
    string |
    undefined
): number | null {
  if (
    !value
  ) {
    return null;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      0 ||
    parsed >
      23
  ) {
    return null;
  }

  return parsed;
}

//--------------------------------------------------
// Service Window
//--------------------------------------------------

function isWithinServiceWindow(
  timezone:
    string,

  startHour:
    number,

  endHour:
    number
): boolean {
  try {
    const hourText =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            timezone,

          hour:
            "2-digit",

          hourCycle:
            "h23",
        }
      ).format(
        new Date()
      );

    const currentHour =
      Number(
        hourText
      );

    if (
      !Number.isFinite(
        currentHour
      )
    ) {
      return false;
    }

    //------------------------------------------------
    // Same start/end means 24-hour availability
    //------------------------------------------------

    if (
      startHour ===
      endHour
    ) {
      return true;
    }

    //------------------------------------------------
    // Normal Window
    //
    // Example: 09 -> 18
    //------------------------------------------------

    if (
      startHour <
      endHour
    ) {
      return (
        currentHour >=
          startHour &&
        currentHour <
          endHour
      );
    }

    //------------------------------------------------
    // Overnight Window
    //
    // Example: 20 -> 06
    //------------------------------------------------

    return (
      currentHour >=
        startHour ||
      currentHour <
        endHour
    );
  } catch {
    return false;
  }
}
