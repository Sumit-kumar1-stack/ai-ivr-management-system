import { describe, expect, it } from "vitest";
import { beginMediaDrain, canAcceptMediaStreams, getMediaDrainTimeoutMs, getMediaLifecycleState, markMediaRunning, markMediaTerminated } from "@/server/media-lifecycle";

describe("media lifecycle", () => {
  it("rejects new streams while draining without terminating existing ownership state", () => {
    markMediaRunning();
    expect(canAcceptMediaStreams()).toBe(true);
    beginMediaDrain();
    expect(getMediaLifecycleState()).toBe("DRAINING");
    expect(canAcceptMediaStreams()).toBe(false);
    markMediaTerminated();
  });

  it("bounds invalid drain timeout configuration", () => {
    expect(getMediaDrainTimeoutMs({ NODE_ENV: "test", MEDIA_DRAIN_TIMEOUT_MS: "1000" })).toBe(30_000);
    expect(getMediaDrainTimeoutMs({ NODE_ENV: "test", MEDIA_DRAIN_TIMEOUT_MS: "6000" })).toBe(6000);
  });
});
