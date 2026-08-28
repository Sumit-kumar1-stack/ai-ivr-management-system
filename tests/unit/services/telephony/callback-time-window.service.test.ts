import { describe, expect, it } from "vitest";
import { parseCallbackTimeWindow } from "@/services/telephony/callback-time-window.service";

describe("callback time-window parsing", () => {
  const now = new Date("2026-08-28T08:00:00.000Z"); // 13:30 Asia/Kolkata

  it("parses tomorrow morning in the supplied tenant timezone", () => {
    const window = parseCallbackTimeWindow("tomorrow morning", "Asia/Kolkata", now);
    expect(window).toMatchObject({ action: "RESOLVED", timezone: "Asia/Kolkata" });
    if (window.action === "RESOLVED") {
      expect(window.preferredStart.toISOString()).toBe("2026-08-29T03:30:00.000Z");
      expect(window.preferredEnd.toISOString()).toBe("2026-08-29T06:30:00.000Z");
    }
  });

  it("parses after 4 PM as a bounded local window", () => {
    const window = parseCallbackTimeWindow("after 4 PM", "America/New_York", now);
    expect(window).toMatchObject({ action: "RESOLVED", timezone: "America/New_York" });
    if (window.action === "RESOLVED") {
      expect(window.preferredStart.toISOString()).toBe("2026-08-28T20:00:00.000Z");
      expect(window.preferredEnd.toISOString()).toBe("2026-08-28T22:00:00.000Z");
    }
  });

  it("returns clarification for ambiguous text and exhausted same-day windows", () => {
    expect(parseCallbackTimeWindow("some time soon", "UTC", now)).toMatchObject({ action: "ASK_CLARIFICATION" });
    expect(parseCallbackTimeWindow("later today", "UTC", new Date("2026-08-28T17:30:00.000Z"))).toMatchObject({ action: "ASK_CLARIFICATION" });
  });
});
