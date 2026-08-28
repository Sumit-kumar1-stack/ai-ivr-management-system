export type CallbackTimeWindow = { action: "RESOLVED"; preferredStart: Date; preferredEnd: Date; timezone: string } | { action: "ASK_CLARIFICATION"; reason: string };

/** Deterministic, deliberately bounded language for callback scheduling. */
export function parseCallbackTimeWindow(input: string, timezone: string, now = new Date()): CallbackTimeWindow {
  const normalized = input.trim().toLowerCase();
  if (!isTimezone(timezone)) return { action: "ASK_CLARIFICATION", reason: "A valid callback timezone is required." };
  const local = localParts(now, timezone);
  const at = (dayOffset: number, startMinute: number, endMinute: number) => toWindow(local, dayOffset, startMinute, endMinute, timezone);
  if (normalized === "tomorrow morning") return at(1, 9 * 60, 12 * 60);
  if (normalized === "later today") return at(0, Math.max(local.hour * 60 + local.minute + 60, 9 * 60), 18 * 60);
  const after = normalized.match(/^after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (after) { const hour = to24Hour(Number(after[1]), after[3]); const minute = Number(after[2] ?? 0); return at(0, hour * 60 + minute, 18 * 60); }
  return { action: "ASK_CLARIFICATION", reason: "Please provide a callback day and a time window, for example tomorrow morning." };
}

function toWindow(date: { year: number; month: number; day: number }, offset: number, start: number, end: number, timezone: string): CallbackTimeWindow {
  if (start >= end) return { action: "ASK_CLARIFICATION", reason: "Please provide a callback time before the end of the service window." };
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day + offset));
  // The database keeps UTC instants.  Convert the caller's wall-clock window
  // using its IANA timezone instead of treating local clock time as UTC.
  const startUtc = zonedDateTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(start / 60), start % 60, timezone);
  const endUtc = zonedDateTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(end / 60), end % 60, timezone);
  return { action: "RESOLVED", preferredStart: startUtc, preferredEnd: endUtc, timezone };
}
function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const rendered = localParts(guess, timezone);
  const offsetMs = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute) - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}
function localParts(now: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); const get = (type: string) => Number(parts.find(part => part.type === type)?.value); return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }; }
function isTimezone(timezone: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return true; } catch { return false; } }
function to24Hour(hour: number, marker: string) { const base = hour % 12; return marker === "pm" ? base + 12 : base; }
