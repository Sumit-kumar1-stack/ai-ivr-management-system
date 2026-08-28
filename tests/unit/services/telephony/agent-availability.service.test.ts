import { describe, expect, it } from "vitest";
import { isWithinBusinessHours, resolveAgentAvailability } from "@/services/telephony/agent-availability.service";

describe("agent availability", () => {
  const policy = { timezone: "Asia/Kolkata", enabledDays: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" };
  it("reports available only for configured supported in-hours destinations", () => expect(resolveAgentAvailability({ destinationConfigured: true, providerSupported: true, policy, now: new Date("2026-08-24T05:30:00Z") })).toBe("AVAILABLE"));
  it("reports outside hours deterministically", () => expect(resolveAgentAvailability({ destinationConfigured: true, providerSupported: true, policy, now: new Date("2026-08-23T05:30:00Z") })).toBe("OUTSIDE_HOURS"));
  it("fails unsupported providers and missing destinations closed", () => {
    expect(resolveAgentAvailability({ destinationConfigured: true, providerSupported: false })).toBe("UNSUPPORTED");
    expect(resolveAgentAvailability({ destinationConfigured: false, providerSupported: true })).toBe("UNAVAILABLE");
  });
  it("evaluates overnight windows", () => expect(isWithinBusinessHours({ timezone: "UTC", enabledDays: [1], startTime: "20:00", endTime: "06:00" }, new Date("2026-08-24T22:00:00Z"))).toBe(true));
});
