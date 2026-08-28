import { describe, expect, it } from "vitest";

import { resolveRealtimeInputCapability } from "@/services/ivr/realtime-input-capability.service";

describe("realtime input capability", () => {
  it("distinguishes documented live DTMF delivery from XML-only DTMF collection", () => {
    expect(resolveRealtimeInputCapability({ provider: "TWILIO", runtime: "GEMINI_LIVE", inputMode: "VOICE_AND_DTMF" }))
      .toMatchObject({ support: "SUPPORTED", provider: "TWILIO" });

    expect(resolveRealtimeInputCapability({ provider: "PLIVO", runtime: "GEMINI_LIVE", inputMode: "VOICE_AND_DTMF" }))
      .toMatchObject({ support: "UNSUPPORTED", provider: "PLIVO", message: expect.stringContaining("XML input-control flow") });

    expect(resolveRealtimeInputCapability({ provider: "PLIVO", runtime: "GEMINI_LIVE", inputMode: "STAGED_HYBRID" }))
      .toMatchObject({ support: "SUPPORTED", provider: "PLIVO", message: expect.stringContaining("before the realtime AI") });
  });

  it("marks an unbound builder context as degraded instead of assuming support", () => {
    expect(resolveRealtimeInputCapability({ inputMode: "VOICE_AND_DTMF" }))
      .toMatchObject({ support: "DEGRADED" });
  });
});
