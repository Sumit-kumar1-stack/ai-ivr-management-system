export type MediaLifecycleState = "RUNNING" | "DRAINING" | "TERMINATED";

let state: MediaLifecycleState = "TERMINATED";

export function markMediaRunning(): void { state = "RUNNING"; }
export function beginMediaDrain(): void { if (state === "RUNNING") state = "DRAINING"; }
export function markMediaTerminated(): void { state = "TERMINATED"; }
export function canAcceptMediaStreams(): boolean { return state === "RUNNING"; }
export function getMediaLifecycleState(): MediaLifecycleState { return state; }

export function getMediaDrainTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.MEDIA_DRAIN_TIMEOUT_MS ?? 30_000);
  return Number.isInteger(value) && value >= 5_000 && value <= 120_000 ? value : 30_000;
}
