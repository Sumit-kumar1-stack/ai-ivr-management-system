import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => {
  const roomEmit = vi.fn();
  const io = {
    emit: vi.fn(),
    to: vi.fn(() => ({
      emit: roomEmit,
    })),
    engine: {
      clientsCount: 0,
    },
  };

  return {
    io,
    roomEmit,
    getIO: vi.fn(() => io),
    warn: vi.fn(),
  };
});

vi.mock("@/server/socket", () => ({
  getIO: mocks.getIO,
}));

vi.mock("@/lib/logger", () => ({
  createServerLogger: vi.fn(() => ({
    warn: mocks.warn,
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
  normalizeError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
}));

import { SocketEvents } from "@/server/socket-events";
import { SocketService } from "@/services/realtime/socket.service";

describe("tenant-scoped realtime emitters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops tenant-scoped socket events without a tenantId", () => {
    const result = SocketEvents.emit("call.status", {
      callId: "call-1",
      status: "RINGING",
    });

    expect(result).toBe(false);
    expect(mocks.io.emit).not.toHaveBeenCalled();
    expect(mocks.io.to).not.toHaveBeenCalled();
  });

  it("emits tenant-scoped socket events to the tenant room", () => {
    const result = SocketEvents.emit("call.status", {
      tenantId: "tenant-1",
      callId: "call-1",
      status: "RINGING",
    });

    expect(result).toBe(true);
    expect(mocks.io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(mocks.roomEmit).toHaveBeenCalledWith(
      "call.status",
      expect.objectContaining({
        tenantId: "tenant-1",
      })
    );
  });

  it("drops tenant-scoped socket service events without a tenantId", () => {
    SocketService.emit("campaign.event", {
      campaignId: "campaign-1",
    });

    expect(mocks.io.emit).not.toHaveBeenCalled();
    expect(mocks.io.to).not.toHaveBeenCalled();
  });

  it("routes socket service events to the tenant room", () => {
    SocketService.emit("campaign.event", {
      tenantId: "tenant-1",
      campaignId: "campaign-1",
    });

    expect(mocks.io.to).toHaveBeenCalledWith("tenant:tenant-1");
    expect(mocks.roomEmit).toHaveBeenCalledWith(
      "campaign.event",
      expect.objectContaining({
        tenantId: "tenant-1",
      })
    );
  });
});
