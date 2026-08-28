//--------------------------------------------------
// Confirmation Intent
//--------------------------------------------------

export type ConfirmationIntent =
  | "CONFIRM"
  | "REJECT"
  | "CANCEL"
  | "UNKNOWN";

//--------------------------------------------------
// Phone
//--------------------------------------------------

export function extractPhoneFromTurn(
  text:
    string
): string | null {
  const normalized =
    text.trim();

  //------------------------------------------------
  // Explicit +country-code form
  //------------------------------------------------

  const international =
    normalized.match(
      /\+[1-9][0-9\s()-]{7,20}/
    );

  if (
    international
  ) {
    const compact =
      international[0]
        .replace(
          /[\s()-]/g,
          ""
        );

    if (
      /^\+[1-9]\d{7,14}$/.test(
        compact
      )
    ) {
      return compact;
    }
  }

  //------------------------------------------------
  // India 10-digit Mobile
  //------------------------------------------------

  const digits =
    normalized.replace(
      /\D/g,
      ""
    );

  if (
    /^[6-9]\d{9}$/.test(
      digits
    )
  ) {
    return `+91${digits}`;
  }

  //------------------------------------------------
  // 91 + 10 digits
  //------------------------------------------------

  if (
    /^91[6-9]\d{9}$/.test(
      digits
    )
  ) {
    return `+${digits}`;
  }

  return null;
}

//--------------------------------------------------
// Email
//--------------------------------------------------

export function extractEmailFromTurn(
  text:
    string
): string | null {
  const match =
    text.match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
    );

  return (
    match?.[0]
      ?.trim()
      .toLowerCase() ??
    null
  );
}

//--------------------------------------------------
// Confirmation
//--------------------------------------------------

export function detectConfirmationIntent(
  text:
    string
): ConfirmationIntent {
  const normalized =
    normalizeIntentText(
      text
    );

  //------------------------------------------------
  // Cancellation First
  //------------------------------------------------

  if (
    matchesAny(
      normalized,
      [
        "cancel",
        "cancel it",
        "forget it",
        "never mind",
        "nevermind",
        "stop this",
        "don't do it",
        "do not do it",
      ]
    )
  ) {
    return "CANCEL";
  }

  //------------------------------------------------
  // Reject
  //------------------------------------------------

  if (
    matchesAny(
      normalized,
      [
        "no",
        "nope",
        "incorrect",
        "that's wrong",
        "that is wrong",
        "not correct",
        "don't save",
        "do not save",
        "don't confirm",
        "do not confirm",
      ]
    )
  ) {
    return "REJECT";
  }

  //------------------------------------------------
  // Confirm
  //------------------------------------------------

  if (
    matchesAny(
      normalized,
      [
        "yes",
        "yeah",
        "yep",
        "correct",
        "that's correct",
        "that is correct",
        "confirm",
        "confirmed",
        "go ahead",
        "please do",
        "do it",
        "save it",
      ]
    )
  ) {
    return "CONFIRM";
  }

  return "UNKNOWN";
}

//--------------------------------------------------
// Timezone
//--------------------------------------------------

export function extractTimezoneFromTurn(
  text:
    string
): string | null {
  const normalized =
    text
      .trim()
      .toLowerCase();

  //------------------------------------------------
  // India
  //------------------------------------------------

  if (
    normalized.includes(
      "india"
    ) ||
    normalized.includes(
      "indian"
    ) ||
    normalized.includes(
      "ist"
    ) ||
    normalized.includes(
      "kolkata"
    ) ||
    normalized.includes(
      "calcutta"
    )
  ) {
    return "Asia/Kolkata";
  }

  //------------------------------------------------
  // Explicit IANA timezone
  //------------------------------------------------

  const iana =
    text.match(
      /\b[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/
    );

  if (
    iana
  ) {
    try {
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            iana[0],
        }
      );

      return iana[0];
    } catch {
      return null;
    }
  }

  return null;
}

//--------------------------------------------------
// Callback Date/Time
//--------------------------------------------------

export function extractCallbackDateTimeFromTurn(
  text:
    string,

  timezone:
    string
): string | null {
  const normalized =
    text
      .trim()
      .toLowerCase();

  if (
    !normalized
  ) {
    return null;
  }

  //------------------------------------------------
  // Already ISO With Z / Offset
  //------------------------------------------------

  const isoMatch =
    text.match(
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/
    );

  if (
    isoMatch &&
    !Number.isNaN(
      Date.parse(
        isoMatch[0]
      )
    )
  ) {
    return new Date(
      Date.parse(
        isoMatch[0]
      )
    ).toISOString();
  }

  //------------------------------------------------
  // We currently support relative day phrases only
  // when a clear clock time is present.
  //------------------------------------------------

  const dayOffset =
    normalized.includes(
      "day after tomorrow"
    )
      ? 2
      : normalized.includes(
            "tomorrow"
          )
        ? 1
        : normalized.includes(
              "today"
            )
          ? 0
          : null;

  if (
    dayOffset ===
    null
  ) {
    return null;
  }

  const clock =
    extractClockTime(
      normalized
    );

  if (
    !clock
  ) {
    return null;
  }

  //------------------------------------------------
  // Build Date In Requested Timezone
  //------------------------------------------------

  const currentParts =
    getDatePartsInTimezone(
      new Date(),
      timezone
    );

  if (
    !currentParts
  ) {
    return null;
  }

  const localBase =
    new Date(
      Date.UTC(
        currentParts.year,
        currentParts.month -
          1,
        currentParts.day
      )
    );

  localBase.setUTCDate(
    localBase.getUTCDate() +
      dayOffset
  );

  const targetYear =
    localBase.getUTCFullYear();

  const targetMonth =
    localBase.getUTCMonth() +
    1;

  const targetDay =
    localBase.getUTCDate();

  return zonedLocalToIso(
    {
      year:
        targetYear,

      month:
        targetMonth,

      day:
        targetDay,

      hour:
        clock.hour,

      minute:
        clock.minute,
    },
    timezone
  );
}

//--------------------------------------------------
// Interest
//--------------------------------------------------

export function extractInterestFromTurn(
  text:
    string
): string | null {
  const cleaned =
    cleanCollectedText(
      text
    );

  if (
    cleaned.length <
    2
  ) {
    return null;
  }

  return cleaned;
}

//--------------------------------------------------
// Name
//--------------------------------------------------

export function extractNameFromTurn(
  text:
    string
): string | null {
  const normalized =
    cleanCollectedText(
      text
    );

  const patterns = [
    /^my name is\s+(.+)$/i,
    /^i am\s+(.+)$/i,
    /^i'm\s+(.+)$/i,
    /^this is\s+(.+)$/i,
  ];

  for (
    const pattern of
    patterns
  ) {
    const match =
      normalized.match(
        pattern
      );

    const candidate =
      match?.[1]
        ?.trim();

    if (
      candidate &&
      candidate.length >=
        2 &&
      candidate.length <=
        100
    ) {
      return candidate;
    }
  }

  return null;
}

//--------------------------------------------------
// Clock
//--------------------------------------------------

interface ClockTime {
  hour:
    number;

  minute:
    number;
}

function extractClockTime(
  text:
    string
): ClockTime | null {
  //------------------------------------------------
  // 3 PM / 3:30 pm
  //------------------------------------------------

  const twelveHour =
    text.match(
      /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i
    );

  if (
    twelveHour
  ) {
    let hour =
      Number(
        twelveHour[1]
      );

    const minute =
      twelveHour[2]
        ? Number(
            twelveHour[2]
          )
        : 0;

    const meridiem =
      twelveHour[3]
        .toLowerCase();

    if (
      meridiem ===
        "pm" &&
      hour !==
        12
    ) {
      hour +=
        12;
    }

    if (
      meridiem ===
        "am" &&
      hour ===
        12
    ) {
      hour =
        0;
    }

    return {
      hour,
      minute,
    };
  }

  //------------------------------------------------
  // "at 15:30"
  //------------------------------------------------

  const twentyFourHour =
    text.match(
      /\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/i
    );

  if (
    twentyFourHour
  ) {
    return {
      hour:
        Number(
          twentyFourHour[1]
        ),

      minute:
        Number(
          twentyFourHour[2]
        ),
    };
  }

  //------------------------------------------------
  // "at 3" — interpret as local clock hour.
  //
  // Do not guess AM/PM here.
  //------------------------------------------------

  return null;
}

//--------------------------------------------------
// Date Parts
//--------------------------------------------------

interface LocalDateParts {
  year:
    number;

  month:
    number;

  day:
    number;
}

function getDatePartsInTimezone(
  date:
    Date,

  timezone:
    string
): LocalDateParts | null {
  try {
    const formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            timezone,

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",
        }
      );

    const parts =
      formatter.formatToParts(
        date
      );

    const year =
      Number(
        parts.find(
          item =>
            item.type ===
            "year"
        )?.value
      );

    const month =
      Number(
        parts.find(
          item =>
            item.type ===
            "month"
        )?.value
      );

    const day =
      Number(
        parts.find(
          item =>
            item.type ===
            "day"
        )?.value
      );

    if (
      !year ||
      !month ||
      !day
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
    };
  } catch {
    return null;
  }
}

//--------------------------------------------------
// Local Time -> UTC ISO
//--------------------------------------------------

function zonedLocalToIso(
  local: {
    year:
      number;

    month:
      number;

    day:
      number;

    hour:
      number;

    minute:
      number;
  },

  timezone:
    string
): string | null {
  /*
   * Intl does not provide direct timezone-to-UTC
   * construction.
   *
   * Resolve offset iteratively:
   *
   * local desired time
   *      ↓
   * initial UTC guess
   *      ↓
   * observe what that UTC instant renders as
   * in target timezone
   *      ↓
   * compensate difference
   */

  try {
    const desiredUtcValue =
      Date.UTC(
        local.year,
        local.month -
          1,
        local.day,
        local.hour,
        local.minute,
        0,
        0
      );

    let guess =
      desiredUtcValue;

    for (
      let iteration =
        0;
      iteration <
        3;
      iteration +=
        1
    ) {
      const rendered =
        getDateTimePartsInTimezone(
          new Date(
            guess
          ),
          timezone
        );

      if (
        !rendered
      ) {
        return null;
      }

      const renderedUtcValue =
        Date.UTC(
          rendered.year,
          rendered.month -
            1,
          rendered.day,
          rendered.hour,
          rendered.minute,
          0,
          0
        );

      const difference =
        desiredUtcValue -
        renderedUtcValue;

      guess +=
        difference;

      if (
        difference ===
        0
      ) {
        break;
      }
    }

    const result =
      new Date(
        guess
      );

    if (
      Number.isNaN(
        result.getTime()
      )
    ) {
      return null;
    }

    return result.toISOString();
  } catch {
    return null;
  }
}

//--------------------------------------------------
// Date/Time Parts
//--------------------------------------------------

function getDateTimePartsInTimezone(
  date:
    Date,

  timezone:
    string
): {
  year:
    number;

  month:
    number;

  day:
    number;

  hour:
    number;

  minute:
    number;
} | null {
  try {
    const formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            timezone,

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit",

          hourCycle:
            "h23",
        }
      );

    const parts =
      formatter.formatToParts(
        date
      );

    const get =
      (
        type:
          Intl.DateTimeFormatPartTypes
      ): number =>
        Number(
          parts.find(
            item =>
              item.type ===
              type
          )?.value
        );

    const year =
      get(
        "year"
      );

    const month =
      get(
        "month"
      );

    const day =
      get(
        "day"
      );

    const hour =
      get(
        "hour"
      );

    const minute =
      get(
        "minute"
      );

    if (
      !year ||
      !month ||
      !day ||
      Number.isNaN(
        hour
      ) ||
      Number.isNaN(
        minute
      )
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
      hour,
      minute,
    };
  } catch {
    return null;
  }
}

//--------------------------------------------------
// Intent Helpers
//--------------------------------------------------

function normalizeIntentText(
  text:
    string
): string {
  return text
    .trim()
    .toLowerCase()
    .replace(
      /[.!?]+$/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
}

function matchesAny(
  value:
    string,

  candidates:
    string[]
): boolean {
  return candidates.some(
    candidate =>
      value ===
      candidate
  );
}

//--------------------------------------------------
// Clean Collected Text
//--------------------------------------------------

function cleanCollectedText(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    )
    .slice(
      0,
      500
    );
}