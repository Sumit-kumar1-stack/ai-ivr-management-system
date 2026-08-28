import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ abort: vi.fn(), create: vi.fn(), clear: vi.fn(), cancel: vi.fn(), interrupt: vi.fn(), begin: vi.fn(), setGeneration: vi.fn(), complete: vi.fn(), logger: vi.fn() }));
vi.mock("@/services/conversations/abort.service", () => ({ ConversationAbort: { create: mocks.create, abort: mocks.abort, clear: mocks.clear } }));
vi.mock("@/services/voice-runtime/standard-partial-prefetch.service", () => ({ StandardPartialPrefetch: { cancel: mocks.cancel, clear: mocks.clear } }));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({ CascadedTurnLatency: { beginTurn: mocks.begin, setGeneration: mocks.setGeneration, interrupt: mocks.interrupt, cleanupCall: mocks.clear } }));
vi.mock("@/services/voice-runtime/standard-runtime-usage.service", () => ({ StandardRuntimeUsage: { complete: mocks.complete } }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: mocks.logger, warn: mocks.logger, debug: mocks.logger }) }));

import { TurnCoordinator } from "@/services/voice-runtime/turn-coordinator.service";
import { voiceQueue } from "@/services/voice/voice-queue.service";

const chunk = (id: string) => ({ id, callId: "call-a", text: id, audio: Buffer.from(id), createdAt: new Date() });

describe("Standard interruption and queue matrix", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.create.mockImplementation(() => new AbortController()); voiceQueue.clear("call-a"); TurnCoordinator.cleanup("call-a"); });
  afterEach(() => TurnCoordinator.cleanup("call-a"));

  it("invalidates A then B so only generation C remains active", () => {
    const a = TurnCoordinator.beginTurn("call-a");
    const b = TurnCoordinator.beginTurn("call-a");
    const c = TurnCoordinator.beginTurn("call-a");
    expect(TurnCoordinator.isCurrentGeneration("call-a", a.generationId)).toBe(false);
    expect(TurnCoordinator.isCurrentGeneration("call-a", b.generationId)).toBe(false);
    expect(TurnCoordinator.isCurrentGeneration("call-a", c.generationId)).toBe(true);
    expect(mocks.interrupt).toHaveBeenCalledTimes(2);
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });

  it("keeps queued phrase order and never drops old audio to make room", () => {
    voiceQueue.enqueue("call-a", chunk("one"));
    voiceQueue.enqueue("call-a", chunk("two"));
    voiceQueue.enqueue("call-a", chunk("three"));
    expect(voiceQueue.size("call-a")).toBe(3);
    expect([voiceQueue.dequeue("call-a")?.id, voiceQueue.dequeue("call-a")?.id, voiceQueue.dequeue("call-a")?.id]).toEqual(["one", "two", "three"]);
  });

  it("does not duplicate a final short residual when the buffer is flushed once", () => {
    voiceQueue.enqueue("call-a", chunk("final"));
    expect(voiceQueue.flush("call-a").map(item => item.id)).toEqual(["final"]);
    expect(voiceQueue.flush("call-a")).toEqual([]);
  });
});
