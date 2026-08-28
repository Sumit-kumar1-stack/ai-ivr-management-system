import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  log: { info: vi.fn(), error: vi.fn() },
  getState: vi.fn(),
  setStage: vi.fn(),
  clearState: vi.fn(),
  startWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  executeCallback: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => mocks.log),
  normalizeError: vi.fn(() => ({ message: "error" })),
}));

vi.mock("@/services/ivr/ivr-action-executor.service", () => ({
  executeConfirmedCallback: mocks.executeCallback,
}));

vi.mock("@/services/conversations/business-workflow-state.service", () => ({
  clearBusinessWorkflowState: mocks.clearState,
  getBusinessWorkflowState: mocks.getState,
  setBusinessWorkflowStage: mocks.setStage,
  startCallbackWorkflow: mocks.startWorkflow,
  updateCallbackWorkflow: mocks.updateWorkflow,
}));

import {
  confirmCallbackConversation,
} from "@/services/conversations/callback-conversation.service";

const activeCallback = {
  type: "CALLBACK",
  id: "workflow-1",
  callback: {
    phone: "+15551234567",
    scheduledFor: "2026-08-25T10:00:00.000Z",
    timezone: "America/New_York",
    reason: "Human transfer unavailable",
  },
};

describe("callback conversation confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearState.mockResolvedValue(undefined);
    mocks.setStage.mockResolvedValue(undefined);
  });

  it("cancels the callback without executing it when the caller rejects confirmation", async () => {
    mocks.getState.mockResolvedValue(activeCallback);

    const result = await confirmCallbackConversation("call-1", false);

    expect(result.completed).toBe(false);
    expect(result.prompt).toContain("cancelled");
    expect(mocks.clearState).toHaveBeenCalledWith("call-1");
    expect(mocks.executeCallback).not.toHaveBeenCalled();
  });

  it("executes and completes the callback only after confirmation", async () => {
    mocks.getState.mockResolvedValue(activeCallback);
    mocks.executeCallback.mockResolvedValue({ success: true });

    const result = await confirmCallbackConversation("call-1", true);

    expect(result.completed).toBe(true);
    expect(mocks.executeCallback).toHaveBeenCalledWith("call-1", expect.objectContaining({
      phone: "+15551234567",
      requestedBy: "AI",
    }));
    expect(mocks.setStage).toHaveBeenCalledWith("call-1", "EXECUTING");
    expect(mocks.setStage).toHaveBeenCalledWith("call-1", "COMPLETED");
    expect(mocks.clearState).toHaveBeenCalledWith("call-1");
  });
});
