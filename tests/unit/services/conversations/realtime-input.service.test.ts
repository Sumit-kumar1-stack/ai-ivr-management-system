import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCall: vi.fn(),
  getSession: vi.fn(),
  routeDtmf: vi.fn(),
  routeVoice: vi.fn(),
  routeMainMenu: vi.fn(),
  routeToNode: vi.fn(),
  handleResult: vi.fn(),
  clearPlayback: vi.fn(),
  getConversation: vi.fn(),
  startVoice: vi.fn(),
  addText: vi.fn(),
  transfer: vi.fn(),
  endCall: vi.fn(),
  routeLiveTurn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/services/calls/call.service", () => ({ getCall: mocks.getCall }));
vi.mock("@/services/ivr/ivr-flow-session.service", () => ({ IVRFlowSessionService: { get: mocks.getSession } }));
vi.mock("@/services/ivr/ivr-hybrid-router.service", () => ({
  routeDtmfThroughIVR: mocks.routeDtmf,
  routeVoiceThroughIVR: mocks.routeVoice,
  routeMainMenuThroughIVR: mocks.routeMainMenu,
  routeToIVRNode: mocks.routeToNode,
}));
vi.mock("@/services/ivr/ivr-execution-result-handler.service", () => ({ handleIVRGraphExecutionResult: mocks.handleResult }));
vi.mock("@/providers/telephony/audio-session.service", () => ({ AudioSessionService: { clearPlayback: mocks.clearPlayback } }));
vi.mock("@/services/conversations/conversation.service", () => ({ ConversationService: { getConversation: mocks.getConversation } }));
vi.mock("@/services/voice/voice-worker.service", () => ({ VoiceWorker: { start: mocks.startVoice, addText: mocks.addText } }));
vi.mock("@/services/telephony/human-transfer-orchestrator.service", () => ({ orchestrateHumanTransfer: mocks.transfer }));
vi.mock("@/services/telephony/end-call.service", () => ({ endProviderCall: mocks.endCall }));
vi.mock("@/services/conversations/live-turn-router.service", () => ({ routeLiveTurn: mocks.routeLiveTurn }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: mocks.info }) }));

import { routeRealtimeCallInput } from "@/services/conversations/realtime-input.service";

const execution = {
  status: "AWAITING_INPUT" as const,
  currentNodeId: "loan",
  nextNodeId: null,
  speechText: "Loan information.",
  awaitInput: true,
  endCall: false,
  transitionReason: "MENU_OPTION",
};

function graphRoute() {
  return { matched: true, confidence: 1, action: "NAVIGATE", execution, graphExecution: execution, continueConversation: false };
}

describe("Realtime input bus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCall.mockResolvedValue({
      id: "call-1",
      ivrFlowVersion: {
        status: "PUBLISHED",
        nodes: [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "menu" } },
          { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [{ digit: "1", label: "Personal loan" }] } },
          { id: "loan", data: { nodeKind: "AI_CONVERSATION" } },
        ],
      },
    });
    mocks.getSession.mockResolvedValue({ flowId: "flow-1", currentNodeId: "menu" });
    mocks.routeDtmf.mockResolvedValue(graphRoute());
    mocks.routeVoice.mockResolvedValue(graphRoute());
    mocks.routeMainMenu.mockResolvedValue(graphRoute());
    mocks.routeToNode.mockResolvedValue(graphRoute());
    mocks.handleResult.mockResolvedValue({ queuedSpeech: true });
    mocks.clearPlayback.mockReturnValue(true);
    mocks.addText.mockResolvedValue(true);
    mocks.transfer.mockResolvedValue({ transferred: false, message: "No agent is free; I can arrange a callback." });
    mocks.endCall.mockResolvedValue({ success: true, code: null, message: "Call end request was accepted." });
  });

  it("normalizes voice and keypad choices into the same graph target", async () => {
    const voice = await routeRealtimeCallInput({ type: "VOICE", callId: "call-1", provider: "PLIVO", text: "personal loan", isFinal: true, timestamp: 1 });
    const dtmf = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "PLIVO", digit: "1", timestamp: 2 });

    expect(voice.intent).toMatchObject({ source: "VOICE", targetNodeId: "loan" });
    expect(dtmf.intent).toMatchObject({ source: "DTMF", targetNodeId: "loan" });
    expect(mocks.routeVoice).toHaveBeenCalledWith("call-1", "personal loan", undefined);
    expect(mocks.routeDtmf).toHaveBeenCalledWith("call-1", "1");
  });

  it("routes 0 through the existing transfer policy and clears active playback", async () => {
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "TWILIO", digit: "0", timestamp: 1 });

    expect(mocks.clearPlayback).toHaveBeenCalledWith("call-1");
    expect(mocks.transfer).toHaveBeenCalledWith("call-1", expect.stringContaining("keypad"));
    expect(result.intent).toMatchObject({ intent: "HUMAN_AGENT" });
  });

  it("repeats the most recent assistant response without changing graph state", async () => {
    mocks.getConversation.mockResolvedValue({ messages: [{ role: "ASSISTANT", content: "Your application is in review." }] });
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "EXOTEL", digit: "9", timestamp: 1 });

    expect(mocks.addText).toHaveBeenCalledWith("call-1", "Your application is in review.");
    expect(result.reason).toBe("REPEATED_ASSISTANT_RESPONSE");
  });

  it("returns to the configured main menu and cleanly ends on #", async () => {
    const menu = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "TWILIO", digit: "*", timestamp: 1 });
    const end = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "TWILIO", digit: "#", timestamp: 2 });

    expect(mocks.routeMainMenu).toHaveBeenCalledWith("call-1", "menu");
    expect(menu.intent).toMatchObject({ intent: "MAIN_MENU" });
    expect(mocks.endCall).toHaveBeenCalledWith("call-1");
    expect(end).toMatchObject({ handled: true, endCall: true, speechText: "Thank you for calling. Have a great day." });
  });

  it("does NOT invoke provider REST hangup on XML GetInput END_CALL path (deliverOutput: false)", async () => {
    const end = await routeRealtimeCallInput(
      { type: "DTMF", callId: "call-1", provider: "PLIVO", digit: "#", timestamp: 1 },
      { deliverOutput: false }
    );

    expect(mocks.endCall).not.toHaveBeenCalled();
    expect(end).toMatchObject({ handled: true, endCall: true, speechText: "Thank you for calling. Have a great day." });
  });

  it("routes END_CALL through builder END_CALL node when present without invoking REST hangup on XML path", async () => {
    const endExecution = {
      status: "ENDED" as const,
      currentNodeId: "end-node",
      nextNodeId: null,
      speechText: "Thank you for contacting Test Services. Goodbye.",
      awaitInput: false,
      endCall: true,
      transitionReason: "END_CALL",
    };
    mocks.getCall.mockResolvedValue({
      id: "call-1",
      ivrFlowVersion: {
        status: "PUBLISHED",
        nodes: [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "menu" } },
          { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [{ digit: "9", label: "End call", action: "END_CALL", destinationNodeId: "end-node" }] } },
          { id: "end-node", data: { nodeKind: "END_CALL", prompt: "Thank you for contacting Test Services. Goodbye." } },
        ],
      },
    });
    mocks.routeToNode.mockResolvedValue({
      matched: true,
      confidence: 1,
      action: "NAVIGATE",
      execution: endExecution,
      graphExecution: endExecution,
      continueConversation: false,
    });

    const result = await routeRealtimeCallInput(
      { type: "DTMF", callId: "call-1", provider: "PLIVO", digit: "9", timestamp: 1 },
      { deliverOutput: false }
    );

    expect(mocks.routeToNode).toHaveBeenCalledWith("call-1", "end-node", "END_CALL", "9");
    expect(mocks.endCall).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      handled: true,
      endCall: true,
      speechText: "Thank you for contacting Test Services. Goodbye.",
    });
  });

  it("maps Plivo live voice commands through the same canonical actions as 0, 9, star, and hash", async () => {
    mocks.routeVoice.mockResolvedValue({ matched: false, confidence: 0, graphExecution: null, continueConversation: false });
    mocks.getConversation.mockResolvedValue({ messages: [{ role: "ASSISTANT", content: "A previous answer." }] });
    await routeRealtimeCallInput({ type: "VOICE", callId: "call-1", provider: "PLIVO", text: "talk to a person", isFinal: true, timestamp: 1 });
    await routeRealtimeCallInput({ type: "VOICE", callId: "call-1", provider: "PLIVO", text: "repeat that", isFinal: true, timestamp: 2 });
    await routeRealtimeCallInput({ type: "VOICE", callId: "call-1", provider: "PLIVO", text: "main menu", isFinal: true, timestamp: 3 });
    await routeRealtimeCallInput({ type: "VOICE", callId: "call-1", provider: "PLIVO", text: "goodbye", isFinal: true, timestamp: 4 });

    expect(mocks.transfer).toHaveBeenCalledWith("call-1", expect.stringContaining("keypad"));
    expect(mocks.addText).toHaveBeenCalledWith("call-1", "A previous answer.");
    expect(mocks.routeMainMenu).toHaveBeenCalledWith("call-1", "menu");
    expect(mocks.endCall).toHaveBeenCalledWith("call-1");
  });

  it("rejects malformed DTMF and never treats it as a graph action", async () => {
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: "call-1", provider: "PLIVO", digit: "12", timestamp: 1 });
    expect(result.reason).toBe("INVALID_DTMF");
    expect(mocks.routeDtmf).not.toHaveBeenCalled();
  });
});
