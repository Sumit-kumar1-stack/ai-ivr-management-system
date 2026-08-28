import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRuntime: vi.fn(),
  telephonyProvider: vi.fn(),
  humanTransferProvider: vi.fn(),
  callbackExecutor: vi.fn(),
  campaignWorker: vi.fn(),
  sendSms: vi.fn(),
  sendWhatsApp: vi.fn(),
  bookCallback: vi.fn(),
  transferToHuman: vi.fn(),
  createLead: vi.fn(),
}));

vi.mock("@/services/ivr/ivr-runtime-selector.service", () => ({
  selectRuntime: mocks.selectRuntime,
}));

import { simulateIVRFlow } from "@/services/ivr/ivr-simulator.service";

describe("IVR dry-run safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRuntime.mockReturnValue({
      selectedRuntime: "STANDARD",
      reasonCode: "AUTO_INFORMATIONAL_USE_CASE",
      reasonText: "Informational routing stays on Standard runtime.",
    });
  });

  it("returns safe structured results without calling production handlers", () => {
    const graph = {
      nodes: [
        { id: "start", data: { nodeKind: "START" } },
        { id: "action", data: { nodeKind: "ACTION", actionCode: "CREATE_LEAD", label: "Create lead" } },
        { id: "transfer", data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1", destinationType: "USER" } },
        { id: "callback", data: { nodeKind: "CALLBACK", callbackConfigId: "cb-1" } },
        { id: "end", data: { nodeKind: "END_CALL" } },
      ],
      edges: [
        { source: "start", target: "action", data: { trigger: "DEFAULT" } },
        { source: "action", target: "transfer", data: { trigger: "DEFAULT" } },
        { source: "transfer", target: "callback", data: { trigger: "HUMAN_TRANSFER" } },
        { source: "transfer", target: "end", data: { trigger: "ACTION_FAILURE" } },
        { source: "callback", target: "end", data: { trigger: "DEFAULT" } },
      ],
    };

    const actionResult = simulateIVRFlow({
      ...graph,
      currentNodeId: "action",
      inputMode: "VOICE",
      input: "create a lead",
      tenantId: "tenant-a",
    });

    const transferResult = simulateIVRFlow({
      ...graph,
      currentNodeId: "transfer",
      inputMode: "VOICE",
      input: "transfer me",
      tenantId: "tenant-a",
    });

    const callbackResult = simulateIVRFlow({
      ...graph,
      currentNodeId: "callback",
      inputMode: "VOICE",
      input: "call me back",
      tenantId: "tenant-a",
    });

    expect(actionResult.actionWouldExecute).toBe("CREATE_LEAD");
    expect(transferResult.actionWouldExecute).toBe("HUMAN_TRANSFER");
    expect(callbackResult.actionWouldExecute).toBe("CALLBACK");
    expect(actionResult.validation.valid).toBe(false);
    expect(transferResult.validation.valid).toBe(false);
    expect(callbackResult.validation.valid).toBe(false);

    expect(mocks.telephonyProvider).not.toHaveBeenCalled();
    expect(mocks.humanTransferProvider).not.toHaveBeenCalled();
    expect(mocks.callbackExecutor).not.toHaveBeenCalled();
    expect(mocks.campaignWorker).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
    expect(mocks.bookCallback).not.toHaveBeenCalled();
    expect(mocks.transferToHuman).not.toHaveBeenCalled();
    expect(mocks.createLead).not.toHaveBeenCalled();
  });
});
