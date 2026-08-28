export type AgentAvailability = "AVAILABLE" | "UNAVAILABLE" | "OUTSIDE_HOURS" | "UNSUPPORTED" | "ERROR";

export type BusinessHoursPolicy = { timezone: string; enabledDays: number[]; startTime: string; endTime: string };

export function resolveAgentAvailability(input: { destinationConfigured: boolean; providerSupported: boolean; policy?: BusinessHoursPolicy | null; now?: Date }): AgentAvailability {
  if (!input.providerSupported) return "UNSUPPORTED";
  if (!input.destinationConfigured) return "UNAVAILABLE";
  if (input.policy && !isWithinBusinessHours(input.policy, input.now ?? new Date())) return "OUTSIDE_HOURS";
  return "AVAILABLE";
}

export function isWithinBusinessHours(policy: BusinessHoursPolicy, now: Date): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: policy.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
    if (!policy.enabledDays.includes(weekday)) return false;
    const minute = Number(value("hour")) * 60 + Number(value("minute"));
    const parse = (time: string) => { const [h, m] = time.split(":").map(Number); return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : Number.NaN; };
    const start = parse(policy.startTime), end = parse(policy.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return start === end || (start < end ? minute >= start && minute < end : minute >= start || minute < end);
  } catch { return false; }
}
