import {
  CallDirection,
  CallStatus,
} from "@prisma/client";

import {
  WebSocket,
} from "ws";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AudioSession,
} from "@/providers/telephony/audio-session.service";

//--------------------------------------------------
// Hoisted Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => {
      const logger = {
        debug:
          vi.fn(),

        info:
          vi.fn(),

        warn:
          vi.fn(),

        error:
          vi.fn(),
      };

      const prisma = {
        call: {
          findUnique:
            vi.fn(),

          updateMany:
            vi.fn(),
        },

        conversation: {
          upsert:
            vi.fn(),
        },

        conversationMessage: {
          count:
            vi.fn(),
        },
      };

      const callService = {
        getCall:
          vi.fn(),
      };

      const audioSession = {
        get:
          vi.fn(),

        getByCallId:
          vi.fn(),

        create:
          vi.fn(),

        close:
          vi.fn(),

        clearPlayback:
          vi.fn(),

        onClose:
          vi.fn(),
      };

      const sttProvider = {
        connect:
          vi.fn(),

        sendAudio:
          vi.fn(),

        disconnect:
          vi.fn(),
      };

      const providerFactory = {
        get:
          vi.fn(
            () =>
              sttProvider
          ),
      };

      const geminiLiveMedia = {
        start:
          vi.fn(),

        beginConversation:
          vi.fn(),

        close:
          vi.fn(),
      };

      const eventPublisher = {
        publish:
          vi.fn(),
      };

      const voiceWorker = {
        start:
          vi.fn(),

        addText:
          vi.fn(),
      };

      const flowSession = {
        get:
          vi.fn(),

        set:
          vi.fn(),

        reset:
          vi.fn(),
      };

      const standardInputRouter = {
        routeStandardInput:
          vi.fn(),
      };

      const ivrGraphExecutor = {
        executeIVRGraphRoute:
          vi.fn(),
      };

      const securitySession = {
        getCallSecuritySession:
          vi.fn(),
      };

      const conversationState = {
        setState:
          vi.fn(),

        getState:
          vi.fn(),
      };

      const startConversation =
        vi.fn();

      return {
        logger,
        prisma,
        callService,
        audioSession,
        sttProvider,
        providerFactory,
        geminiLiveMedia,
        eventPublisher,
        voiceWorker,
        flowSession,
        standardInputRouter,
        ivrGraphExecutor,

        securitySession,

        conversationState,
        startConversation,
      };
    }
  );

//--------------------------------------------------
// Module Mocks
//--------------------------------------------------

vi.mock(
  "@/lib/logger",
  () => ({
    createLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    createCallLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    createServerLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    normalizeError:
      vi.fn(
        (
          error: unknown
        ) => ({
          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
      ),
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma:
      mocks.prisma,
  })
);

vi.mock(
  "@/providers/telephony/audio-session.service",
  () => ({
    AudioSessionService:
      mocks.audioSession,
  })
);

vi.mock(
  "@/services/calls/call.service",
  () => ({
    getCall:
      mocks.callService.getCall,
  })
);

vi.mock(
  "@/services/stt/providers/provider.factory",
  () => ({
    STTProviderFactory:
      mocks.providerFactory,
  })
);

vi.mock(
  "@/services/conversations/conversation-engine.service",
  () => ({
    startConversation:
      mocks.startConversation,
  })
);

vi.mock(
  "@/services/voice/gemini-live-media.service",
  () => ({
    GeminiLiveMediaService:
      mocks.geminiLiveMedia,
  })
);

vi.mock(
  "@/services/security/call-security-session.service",
  () => ({
    getCallSecuritySession:
      mocks.securitySession
        .getCallSecuritySession,
  })
);

vi.mock(
  "@/services/conversations/conversation-state.service",
  () => ({
    ConversationStateService:
      mocks.conversationState,
  })
);

vi.mock(
  "@/services/ivr/ivr-flow-session.service",
  () => ({
    IVRFlowSessionService:
      mocks.flowSession,
  })
);

vi.mock(
  "@/services/ivr/standard-input-router.service",
  () => ({
    routeStandardInput:
      mocks.standardInputRouter
        .routeStandardInput,
  })
);

vi.mock(
  "@/services/ivr/ivr-graph-executor.service",
  () => ({
    executeIVRGraphRoute:
      mocks.ivrGraphExecutor
        .executeIVRGraphRoute,
  })
);

vi.mock(
  "@/services/voice/voice-worker.service",
  () => ({
    VoiceWorker:
      mocks.voiceWorker,
  })
);

vi.mock(
  "@/core/events",
  () => ({
    AppEvent: {
      AUDIO_CONNECTED:
        "audio.connected",

      AUDIO_DISCONNECTED:
        "audio.disconnected",

      AI_SESSION_STARTED:
        "audit.ai_session_started",

      FALLBACK_TRIGGERED:
        "audit.fallback_triggered",

      PROVIDER_CHANGED:
        "audit.provider_changed",

      CONVERSATION_STARTED:
        "conversation.started",

      VOICE_LISTENING:
        "voice.listening",
    },

    EventPublisher:
      mocks.eventPublisher,
  })
);

//--------------------------------------------------
// Import Subject After Mocks
//--------------------------------------------------

import {
  AppEvent,
} from "@/core/events";

import {
  TwilioStreamGateway,
} from "@/providers/telephony/twilio-stream.gateway";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const CALL_ID =
  "call-1";

const CONVERSATION_ID =
  "conversation-1";

const PROVIDER_CALL_ID =
  "CA123456789";

const OTHER_PROVIDER_CALL_ID =
  "CA987654321";

const STREAM_SID =
  "MZ123456789";

const REPLACEMENT_STREAM_SID =
  "MZ987654321";

//--------------------------------------------------
// Test Types
//--------------------------------------------------

interface SocketFixture {
  socket: WebSocket;

  close:
    ReturnType<
      typeof vi.fn
    >;
}

interface StartMessageOptions {
  internalCallId:
    string;

  streamSid:
    string;

  topLevelStreamSid?:
    string;

  twilioCallSid:
    string;

  customTwilioCallSid:
    string;

  direction:
    string;
}

//--------------------------------------------------
// Fixtures
//--------------------------------------------------

function createSocket(): SocketFixture {
  const close =
    vi.fn();

  const socket = {
    close,

    readyState:
      WebSocket.OPEN,
  } as unknown as WebSocket;

  return {
    socket,
    close,
  };
}

function createStoredCall(
  overrides:
    Partial<{
      id: string;

      status: CallStatus;

      providerCallId:
        string |
        null;

      direction:
        CallDirection;

      campaign: {
        communicationVoiceParent:
          {
            id: string;
            tier: "STANDARD" | "PREMIUM";
          } |
          null;
      };
    }> = {}
) {
  return {
    id:
      CALL_ID,

    status:
      CallStatus.ANSWERED,

    providerCallId:
      PROVIDER_CALL_ID,

    direction:
      CallDirection.INBOUND,

    campaign: {
      communicationVoiceParent:
        null,
    },

    ...overrides,
  };
}

function createAudioSession(
  socket: WebSocket,
  overrides:
    Partial<AudioSession> = {}
): AudioSession {
  return {
    callId:
      overrides.callId ??
      CALL_ID,

    twilioCallSid:
      overrides.twilioCallSid ??
      PROVIDER_CALL_ID,

    streamSid:
      overrides.streamSid ??
      STREAM_SID,

    socket:
      overrides.socket ??
      socket,

    voiceRuntime:
      overrides.voiceRuntime ??
      "CASCADED",

    requestedRuntime:
      overrides.requestedRuntime ??
      "CASCADED",

    effectiveRuntime:
      overrides.effectiveRuntime ??
      "CASCADED",

    fallbackUsed:
      overrides.fallbackUsed ??
      false,

    fallbackReason:
      overrides.fallbackReason ??
      null,

    createdAt:
      overrides.createdAt ??
      Date.now(),
  };
}

function createStartMessage(
  overrides:
    Partial<StartMessageOptions> = {}
): string {
  const options:
    StartMessageOptions = {
      internalCallId:
        CALL_ID,

      streamSid:
        STREAM_SID,

      twilioCallSid:
        PROVIDER_CALL_ID,

      customTwilioCallSid:
        PROVIDER_CALL_ID,

      direction:
        "inbound",

      ...overrides,
    };

  return JSON.stringify({
    event:
      "start",

    streamSid:
      options.topLevelStreamSid,

    start: {
      streamSid:
        options.streamSid,

      callSid:
        options.twilioCallSid,

      customParameters: {
        callId:
          options.internalCallId,

        twilioCallSid:
          options.customTwilioCallSid,

        direction:
          options.direction,
      },
    },
  });
}

function createMediaMessage(
  payload: string,
  streamSid:
    string =
      STREAM_SID
): string {
  return JSON.stringify({
    event:
      "media",

    streamSid,

    media: {
      payload,
    },
  });
}

function createStopMessage(
  streamSid:
    string =
      STREAM_SID
): string {
  return JSON.stringify({
    event:
      "stop",

    streamSid,
  });
}

function expectSocketClosed(
  fixture: SocketFixture,
  code: number,
  reason: string
): void {
  expect(
    fixture.close
  ).toHaveBeenCalledWith(
    code,
    reason
  );
}

//--------------------------------------------------
// Default Mock Setup
//--------------------------------------------------

function configureSuccessfulStart(): void {
  mocks
    .prisma
    .call
    .findUnique
    .mockResolvedValue(
      createStoredCall()
    );

  mocks
    .prisma
    .call
    .updateMany
    .mockResolvedValue({
      count:
        1,
    });

  mocks
    .prisma
    .conversation
    .upsert
    .mockResolvedValue({
      id:
        CONVERSATION_ID,
    });

  mocks
    .prisma
    .conversationMessage
    .count
    .mockResolvedValue(
      0
    );

  mocks
    .securitySession
    .getCallSecuritySession
    .mockResolvedValue({
      callId:
        CALL_ID,

      campaignId:
        "campaign-1",

      contactId:
        "contact-1",

      direction:
        CallDirection.OUTBOUND,

      authenticationLevel:
        "AUTH_LEVEL_1",

      riskLevel:
        "LOW",

      authenticationVerifiedAt:
        null,

      securityFlags:
        {},

      allowedActions: [
        "SEND_INFO",
      ],

      updatedAt:
        new Date(
          "2026-08-20T10:00:00.000Z"
        ),
    });

  mocks
    .audioSession
    .get
    .mockReturnValue(
      undefined
    );

  mocks
    .audioSession
    .getByCallId
    .mockReturnValue(
      undefined
    );

  mocks
    .sttProvider
    .connect
    .mockResolvedValue(
      undefined
    );

  mocks
    .sttProvider
    .sendAudio
    .mockResolvedValue(
      undefined
    );

  mocks
    .sttProvider
    .disconnect
    .mockResolvedValue(
      undefined
    );

  mocks
    .geminiLiveMedia
    .start
    .mockResolvedValue(
      undefined
    );

  mocks
    .geminiLiveMedia
    .beginConversation
    .mockResolvedValue(
      undefined
    );

  mocks
    .geminiLiveMedia
    .close
    .mockResolvedValue(
      undefined
    );

  mocks
    .eventPublisher
    .publish
    .mockResolvedValue(
      true
    );

  mocks
    .conversationState
    .getState
    .mockReturnValue(
      "LISTENING"
    );

  mocks
    .startConversation
    .mockResolvedValue(
      true
    );
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "TwilioStreamGateway",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        configureSuccessfulStart();
      }
    );

    //------------------------------------------------
    // Message Parsing And Connected Event
    //------------------------------------------------

    it(
      "ignores invalid JSON without touching gateway dependencies",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          "{invalid-json"
        );

        expect(
          mocks.logger.warn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.message_rejected",

            reason:
              "invalid_json",
          }),
          "Invalid Twilio WebSocket message"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();

        expect(
          socket.close
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "accepts the Twilio connected event without starting a session",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          JSON.stringify({
            event:
              "connected",
          })
        );

        expect(
          mocks.logger.debug
        ).toHaveBeenCalledWith(
          {
            event:
              "twilio.stream.connected_event_received",
          },
          "Twilio WebSocket connected event received"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .audioSession
            .create
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Start Event Validation
    //------------------------------------------------

    it(
      "rejects a start event without an internal call ID",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage({
            internalCallId:
              "   ",
          })
        );

        expectSocketClosed(
          socket,
          1008,
          "Missing internal call ID"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a start event without a stream SID",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage({
            streamSid:
              "   ",

            topLevelStreamSid:
              "   ",
          })
        );

        expectSocketClosed(
          socket,
          1008,
          "Missing stream SID"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a start event without a Twilio CallSid",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage({
            twilioCallSid:
              "   ",
          })
        );

        expectSocketClosed(
          socket,
          1008,
          "Missing provider call ID"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects mismatched Twilio CallSid custom parameters",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage({
            customTwilioCallSid:
              OTHER_PROVIDER_CALL_ID,
          })
        );

        expectSocketClosed(
          socket,
          1008,
          "Call association mismatch"
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Internal Call Validation
    //------------------------------------------------

    it(
      "rejects a stream when the internal call is not found",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            null
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).toHaveBeenCalledWith({
          where: {
            id:
              CALL_ID,
          },

          select: {
            id:
              true,

            status:
              true,

            providerCallId:
              true,

            direction:
              true,

            tenantId:
              true,

            inboundProfileId:
              true,

            inboundProfile: {
              select: {
                voiceRuntime: true,
              },
            },

            ivrFlowVersion: {
              select: {
                id: true,
                flowId: true,
                versionNumber: true,
                nodes: true,
                edges: true,
              },
            },

            provider:
              true,

            requestedRuntime:
              true,

            campaign: {
              select: {
                communicationVoiceParent: {
                  select: {
                    id:
                      true,

                    tier:
                      true,

                    ownerUser: {
                      select: {
                        tenantId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        expectSocketClosed(
          socket,
          1008,
          "Call not found"
        );

        expect(
          mocks
            .audioSession
            .create
        ).not.toHaveBeenCalled();
      }
    );

    it.each([
      CallStatus.COMPLETED,
      CallStatus.FAILED,
      CallStatus.BUSY,
      CallStatus.NO_ANSWER,
      CallStatus.CANCELED,
    ])(
      "rejects a stream for terminal call status %s",
      async (
        status: CallStatus
      ) => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            createStoredCall({
              status,
            })
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expectSocketClosed(
          socket,
          1008,
          "Call already ended"
        );

        expect(
          mocks
            .prisma
            .conversation
            .upsert
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .sttProvider
            .connect
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a stream when the stored provider ID differs",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            createStoredCall({
              providerCallId:
                OTHER_PROVIDER_CALL_ID,
            })
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expectSocketClosed(
          socket,
          1008,
          "Call association mismatch"
        );

        expect(
          mocks
            .prisma
            .call
            .updateMany
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .audioSession
            .create
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Provider ID Association
    //------------------------------------------------

    it(
      "falls back from Gemini Live to cascaded and audits the runtime change",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            createStoredCall({
              campaign: {
                communicationVoiceParent: {
                  id:
                    "communication-voice-parent-1",

                  tier:
                    "PREMIUM",
                },
              },
            })
          );

        mocks
          .prisma
          .conversationMessage
          .count
          .mockResolvedValue(
            0
          );

        const fallbackSession =
          createAudioSession(
            socket.socket,
            {
              voiceRuntime:
                "GEMINI_LIVE",

              requestedRuntime:
                "GEMINI_LIVE",

              effectiveRuntime:
                "GEMINI_LIVE",
            }
          );

        mocks
          .audioSession
          .create
          .mockReturnValue(
            fallbackSession
          );

        mocks
          .geminiLiveMedia
          .start
          .mockRejectedValueOnce(
            new Error(
              "gemini init failed"
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.FALLBACK_TRIGGERED,
          expect.objectContaining({
            callId:
              CALL_ID,

            requestedRuntime:
              "GEMINI_LIVE",

            effectiveRuntime:
              "CASCADED",
          })
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.PROVIDER_CHANGED,
          expect.objectContaining({
            callId:
              CALL_ID,

            requestedRuntime:
              "GEMINI_LIVE",

            effectiveRuntime:
              "CASCADED",
          })
        );

        expect(
          mocks
            .audioSession
            .create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            voiceRuntime:
              "GEMINI_LIVE",

            fallbackUsed:
              false,
          })
        );

        expect(
          mocks
            .sttProvider
            .connect
        ).toHaveBeenCalledWith(
          CALL_ID
        );
      }
    );

    it(
      "blocks Gemini fallback when the conversation has already ended",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            createStoredCall({
              campaign: {
                communicationVoiceParent: {
                  id:
                    "communication-voice-parent-1",

                  tier:
                    "PREMIUM",
                },
              },
            })
          );

        mocks
          .prisma
          .conversationMessage
          .count
          .mockResolvedValue(
            0
          );

        mocks
          .conversationState
          .getState
          .mockReturnValue(
            "ENDED"
          );

        mocks
          .securitySession
          .getCallSecuritySession
          .mockResolvedValue({
            callId:
              CALL_ID,

            campaignId:
              "campaign-1",

            contactId:
              "contact-1",

            direction:
              CallDirection.OUTBOUND,

            authenticationLevel:
              "AUTH_LEVEL_1",

            riskLevel:
              "LOW",

            authenticationVerifiedAt:
              null,

            securityFlags:
              {},

            allowedActions: [
              "SEND_INFO",
            ],

            updatedAt:
              new Date(
                "2026-08-20T10:00:00.000Z"
              ),
          });

        mocks
          .geminiLiveMedia
          .start
          .mockRejectedValueOnce(
            new Error(
              "gemini init failed"
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .logger.error
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.gemini_live_fallback_blocked",

            fallbackReason:
              "conversation_already_ended",

            authenticationLevel:
              "AUTH_LEVEL_1",

            riskLevel:
              "LOW",
          }),
          "Gemini Live initialization failed; fallback blocked to preserve security state"
        );

        expect(
          mocks
            .sttProvider
            .connect
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .eventPublisher
            .publish
        ).not.toHaveBeenCalledWith(
          AppEvent.FALLBACK_TRIGGERED,
          expect.anything()
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).not.toHaveBeenCalledWith(
          AppEvent.PROVIDER_CHANGED,
          expect.anything()
        );

        expectSocketClosed(
          socket,
          1011,
          "Premium fallback blocked"
        );
      }
    );

    it(
      "associates a missing providerCallId before initializing the stream",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            createStoredCall({
              providerCallId:
                null,
            })
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .prisma
            .call
            .updateMany
        ).toHaveBeenCalledWith({
          where: {
            id:
              CALL_ID,

            providerCallId:
              null,
          },

          data: {
            providerCallId:
              PROVIDER_CALL_ID,
          },
        });

        expect(
          mocks
            .audioSession
            .create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            callId:
              CALL_ID,

            twilioCallSid:
              PROVIDER_CALL_ID,

            streamSid:
              STREAM_SID,

            socket:
              socket.socket,

            voiceRuntime:
              "CASCADED",
          })
        );
      }
    );

    it(
      "accepts a concurrent provider ID association when the stored value matches",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValueOnce(
            createStoredCall({
              providerCallId:
                null,
            })
          )
          .mockResolvedValueOnce({
            providerCallId:
              PROVIDER_CALL_ID,
          });

        mocks
          .prisma
          .call
          .updateMany
          .mockResolvedValue({
            count:
              0,
          });

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          mocks
            .audioSession
            .create
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          socket.close
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a conflicting concurrent provider ID association",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValueOnce(
            createStoredCall({
              providerCallId:
                null,
            })
          )
          .mockResolvedValueOnce({
            providerCallId:
              OTHER_PROVIDER_CALL_ID,
          });

        mocks
          .prisma
          .call
          .updateMany
          .mockResolvedValue({
            count:
              0,
          });

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expectSocketClosed(
          socket,
          1008,
          "Call association conflict"
        );

        expect(
          mocks
            .prisma
            .conversation
            .upsert
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .audioSession
            .create
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Duplicate And Replacement Streams
    //------------------------------------------------

    it(
      "ignores an identical duplicate stream",
      async () => {
        const socket =
          createSocket();

        const existingSession =
          createAudioSession(
            socket.socket
          );

        mocks
          .audioSession
          .getByCallId
          .mockReturnValue(
            existingSession
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .sttProvider
            .disconnect
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .audioSession
            .close
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .prisma
            .conversation
            .upsert
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .sttProvider
            .connect
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "disconnects and replaces an existing stream session",
      async () => {
        const oldSocket =
          createSocket();

        const newSocket =
          createSocket();

        const previousSession =
          createAudioSession(
            oldSocket.socket
          );

        mocks
          .audioSession
          .getByCallId
          .mockReturnValue(
            previousSession
          );

        await TwilioStreamGateway.handle(
          newSocket.socket,
          createStartMessage({
            streamSid:
              REPLACEMENT_STREAM_SID,
          })
        );

        expect(
          mocks
            .sttProvider
            .disconnect
        ).toHaveBeenCalledWith(
          CALL_ID
        );

        expect(
          mocks
            .audioSession
            .close
        ).toHaveBeenCalledWith(
          STREAM_SID
        );

        expect(
          mocks
            .audioSession
            .create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
          callId:
            CALL_ID,

          twilioCallSid:
            PROVIDER_CALL_ID,

          streamSid:
            REPLACEMENT_STREAM_SID,

          socket:
            newSocket.socket,

          voiceRuntime:
            "CASCADED",
          })
        );
      }
    );

    it(
      "continues replacement initialization when previous STT disconnect fails",
      async () => {
        const oldSocket =
          createSocket();

        const newSocket =
          createSocket();

        mocks
          .audioSession
          .getByCallId
          .mockReturnValue(
            createAudioSession(
              oldSocket.socket
            )
          );

        mocks
          .sttProvider
          .disconnect
          .mockRejectedValueOnce(
            new Error(
              "previous disconnect failed"
            )
          );

        await TwilioStreamGateway.handle(
          newSocket.socket,
          createStartMessage({
            streamSid:
              REPLACEMENT_STREAM_SID,
          })
        );

        expect(
          mocks.logger.warn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.previous_stt_disconnect_failed",
          }),
          "Previous STT session could not be disconnected"
        );

        expect(
          mocks
            .audioSession
            .close
        ).toHaveBeenCalledWith(
          STREAM_SID
        );

        expect(
          mocks
            .sttProvider
            .connect
        ).toHaveBeenCalledWith(
          CALL_ID
        );
      }
    );

    //------------------------------------------------
    // Conversation And STT Initialization
    //------------------------------------------------

    it(
      "upserts the conversation and reuses its existing message history",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .conversationMessage
          .count
          .mockResolvedValue(
            3
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .prisma
            .conversation
            .upsert
        ).toHaveBeenCalledWith({
          where: {
            callId:
              CALL_ID,
          },

          update: {},

          create: {
            callId:
              CALL_ID,
          },

          select: {
            id:
              true,
          },
        });

        expect(
          mocks
            .prisma
            .conversationMessage
            .count
        ).toHaveBeenCalledWith({
          where: {
            conversationId:
              CONVERSATION_ID,
          },
        });
      }
    );

    it(
      "connects STT, publishes AUDIO_CONNECTED, and enters LISTENING",
      async () => {
        const socket =
          createSocket();

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .sttProvider
            .connect
        ).toHaveBeenCalledWith(
          CALL_ID
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.AUDIO_CONNECTED,
          {
            callId:
              CALL_ID,

            timestamp:
              expect.any(
                Number
              ),
          }
        );

        expect(
          mocks
            .conversationState
            .setState
        ).toHaveBeenCalledWith(
          CALL_ID,
          "LISTENING"
        );

        expect(
          socket.close
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "ends the conversation and cleans the audio session when STT connection fails",
      async () => {
        const socket =
          createSocket();

        mocks
          .sttProvider
          .connect
          .mockRejectedValue(
            new Error(
              "connect failed"
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks
            .conversationState
            .setState
        ).toHaveBeenCalledWith(
          CALL_ID,
          "ENDED"
        );

        expect(
          mocks
            .audioSession
            .close
        ).toHaveBeenCalledWith(
          STREAM_SID
        );

        expectSocketClosed(
          socket,
          1011,
          "STT connection failed"
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).not.toHaveBeenCalledWith(
          AppEvent.AUDIO_CONNECTED,
          expect.objectContaining({
            callId:
              CALL_ID,
          })
        );

        expect(
          mocks.startConversation
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "queues the greeting only once when a replacement stream resumes the conversation",
      async () => {
        const firstSocket =
          createSocket();

        const replacementSocket =
          createSocket();

        const firstSession =
          createAudioSession(
            firstSocket.socket
          );

        mocks
          .audioSession
          .getByCallId
          .mockReturnValueOnce(
            undefined
          )
          .mockReturnValueOnce(
            firstSession
          );

        mocks
          .prisma
          .conversationMessage
          .count
          .mockResolvedValueOnce(
            0
          )
          .mockResolvedValueOnce(
            1
          );

        await TwilioStreamGateway.handle(
          firstSocket.socket,
          createStartMessage()
        );

        await TwilioStreamGateway.handle(
          replacementSocket.socket,
          createStartMessage({
            streamSid:
              REPLACEMENT_STREAM_SID,
          })
        );

        expect(
          mocks.startConversation
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.startConversation
        ).toHaveBeenCalledWith(
          CALL_ID
        );

        const conversationStartedCalls =
          mocks
            .eventPublisher
            .publish
            .mock
            .calls
            .filter(
              call =>
                call[0] ===
                AppEvent.CONVERSATION_STARTED
            );

        expect(
          conversationStartedCalls
        ).toHaveLength(
          1
        );
      }
    );

    it(
      "resumes an existing conversation without repeating the greeting",
      async () => {
        const socket =
          createSocket();

        mocks
          .prisma
          .conversationMessage
          .count
          .mockResolvedValue(
            2
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStartMessage()
        );

        expect(
          mocks.startConversation
        ).not.toHaveBeenCalled();

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.VOICE_LISTENING,
          {
            callId:
              CALL_ID,

            timestamp:
              expect.any(
                Number
              ),
          }
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).not.toHaveBeenCalledWith(
          AppEvent.CONVERSATION_STARTED,
          expect.objectContaining({
            callId:
              CALL_ID,
          })
        );
      }
    );

    //------------------------------------------------
    // Media Events
    //------------------------------------------------

    it(
      "ignores media received before session registration",
      async () => {
        const socket =
          createSocket();

        mocks
          .audioSession
          .get
          .mockReturnValue(
            undefined
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createMediaMessage(
            Buffer.from(
              "audio"
            ).toString(
              "base64"
            )
          )
        );

        expect(
          mocks.logger.warn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.media_ignored",

            reason:
              "session_not_registered",
          }),
          "Twilio audio received before session registration"
        );

        expect(
          mocks
            .sttProvider
            .sendAudio
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects an invalid Base64 media payload",
      async () => {
        const socket =
          createSocket();

        mocks
          .audioSession
          .get
          .mockReturnValue(
            createAudioSession(
              socket.socket
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createMediaMessage(
            "%%%invalid-base64%%%"
          )
        );

        expect(
          mocks.logger.warn
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.media_rejected",

            reason:
              "invalid_base64",
          }),
          "Twilio media payload was not valid base64"
        );

        expect(
          mocks
            .sttProvider
            .sendAudio
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "forwards valid decoded audio to STT",
      async () => {
        const socket =
          createSocket();

        const audio =
          Buffer.from([
            1,
            2,
            3,
            4,
          ]);

        mocks
          .audioSession
          .get
          .mockReturnValue(
            createAudioSession(
              socket.socket
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createMediaMessage(
            audio.toString(
              "base64"
            )
          )
        );

        expect(
          mocks
            .sttProvider
            .sendAudio
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks
            .sttProvider
            .sendAudio
        ).toHaveBeenCalledWith(
          CALL_ID,
          audio
        );
      }
    );

    //------------------------------------------------
    // Stop Events And Cleanup
    //------------------------------------------------

    it(
      "disconnects STT, ends state, publishes AUDIO_DISCONNECTED, and closes the session on stop",
      async () => {
        const socket =
          createSocket();

        mocks
          .audioSession
          .get
          .mockReturnValue(
            createAudioSession(
              socket.socket
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStopMessage()
        );

        expect(
          mocks
            .sttProvider
            .disconnect
        ).toHaveBeenCalledWith(
          CALL_ID
        );

        expect(
          mocks
            .conversationState
            .setState
        ).toHaveBeenCalledWith(
          CALL_ID,
          "ENDED"
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.AUDIO_DISCONNECTED,
          {
            callId:
              CALL_ID,

            timestamp:
              expect.any(
                Number
              ),
          }
        );

        expect(
          mocks
            .audioSession
            .close
        ).toHaveBeenCalledWith(
          STREAM_SID
        );
      }
    );

    it(
      "still ends state, publishes disconnect, and cleans the session when STT disconnect fails",
      async () => {
        const socket =
          createSocket();

        mocks
          .audioSession
          .get
          .mockReturnValue(
            createAudioSession(
              socket.socket
            )
          );

        mocks
          .sttProvider
          .disconnect
          .mockRejectedValue(
            new Error(
              "disconnect failed"
            )
          );

        await TwilioStreamGateway.handle(
          socket.socket,
          createStopMessage()
        );

        expect(
          mocks.logger.error
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "twilio.stream.voice_runtime_disconnect_failed",

            voiceRuntime:
              "CASCADED",
          }),
          "Failed to disconnect voice runtime"
        );

        expect(
          mocks
            .conversationState
            .setState
        ).toHaveBeenCalledWith(
          CALL_ID,
          "ENDED"
        );

        expect(
          mocks
            .eventPublisher
            .publish
        ).toHaveBeenCalledWith(
          AppEvent.AUDIO_DISCONNECTED,
          expect.objectContaining({
            callId:
              CALL_ID,
          })
        );

        expect(
          mocks
            .audioSession
            .close
        ).toHaveBeenCalledWith(
          STREAM_SID
        );
      }
    );

    //------------------------------------------------
    // DTMF Result Handling
    //------------------------------------------------

    describe(
      "DTMF result handling",
      () => {
        function configureDtmfCall(): void {
          mocks
            .callService
            .getCall
            .mockResolvedValue(
              {
                id: CALL_ID,
                campaignId: "campaign-1",
                ivrFlowVersionId: "v1",
                ivrFlowVersion: {
                  id: "v1",
                  tenantId: "tenant-1",
                  status: "PUBLISHED",
                  nodes: [
                    { id: "start", data: { nodeKind: "START", globalShortcuts: { "0": "DISABLED" } } },
                    { id: "menu", data: { nodeKind: "HYBRID_MENU" } },
                  ],
                  edges: [
                    { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
                  ],
                },
              } as never
            );

          mocks
            .flowSession
            .get
            .mockResolvedValue({
              flowId: "v1",
              currentNodeId: "menu",
              lastTrigger: "DEFAULT",
              lastValue: null,
            });

          mocks
            .audioSession
            .get
            .mockReturnValue(
              createAudioSession(
                createSocket().socket
              )
            );
        }

        it(
          "queues non-terminal speech once and keeps the session active",
          async () => {
            const socket =
              createSocket();

            configureDtmfCall();
            mocks
              .audioSession
              .get
              .mockReturnValue(
                createAudioSession(
                  socket.socket
                )
              );

            mocks
              .standardInputRouter
              .routeStandardInput
              .mockReturnValue({
                matched: true,
                confidence: 1,
                resultingNodeId: "menu",
                transition: "MENU_OPTION",
                action: "NAVIGATE",
                optionLabel: "Continue",
              });

            mocks
              .ivrGraphExecutor
              .executeIVRGraphRoute
              .mockResolvedValue({
                status: "AWAITING_INPUT",
                currentNodeId: "menu",
                nextNodeId: null,
                speechText: "Please continue.",
                awaitInput: false,
                endCall: false,
                transitionReason: "DEFAULT",
              });

            mocks
              .voiceWorker
              .addText
              .mockResolvedValue(true);

            await TwilioStreamGateway.handle(
              socket.socket,
              JSON.stringify({
                event: "dtmf",
                streamSid: STREAM_SID,
                dtmf: { digit: "1" },
              })
            );

            expect(
              mocks
                .standardInputRouter
                .routeStandardInput
            ).toHaveBeenCalledTimes(1);

            expect(
              mocks
                .ivrGraphExecutor
                .executeIVRGraphRoute
            ).toHaveBeenCalledTimes(1);

            expect(
              mocks
                .voiceWorker
                .addText
            ).toHaveBeenCalledWith(
              CALL_ID,
              "Please continue."
            );

            expect(
              mocks
                .voiceWorker
                .start
            ).toHaveBeenCalledTimes(1);

            expect(
              mocks
                .conversationState
                .setState
                .mock.calls
                .some(
                  call =>
                    call[1] === "THINKING"
                )
            ).toBe(true);

            expect(
              mocks
                .conversationState
                .setState
                .mock.calls
                .some(
                  call =>
                    call[1] === "ENDED"
                )
            ).toBe(false);
          }
        );

        it(
          "returns to LISTENING when the executor asks for input",
          async () => {
            const socket =
              createSocket();

            configureDtmfCall();
            mocks
              .audioSession
              .get
              .mockReturnValue(
                createAudioSession(
                  socket.socket
                )
              );

            mocks
              .standardInputRouter
              .routeStandardInput
              .mockReturnValue({
                matched: true,
                confidence: 1,
                resultingNodeId: "menu",
                transition: "MENU_OPTION",
                action: "NAVIGATE",
                optionLabel: "Continue",
              });

            mocks
              .ivrGraphExecutor
              .executeIVRGraphRoute
              .mockResolvedValue({
                status: "AWAITING_INPUT",
                currentNodeId: "menu",
                nextNodeId: null,
                speechText: null,
                awaitInput: true,
                endCall: false,
                transitionReason: "DEFAULT",
              });

            await TwilioStreamGateway.handle(
              socket.socket,
              JSON.stringify({
                event: "dtmf",
                streamSid: STREAM_SID,
                dtmf: { digit: "1" },
              })
            );

            expect(
              mocks
                .conversationState
                .setState
            ).toHaveBeenCalledWith(
              CALL_ID,
              "LISTENING"
            );

            expect(
              mocks
                .voiceWorker
                .addText
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "queues final speech before terminal shutdown for END_CALL",
          async () => {
            const socket =
              createSocket();

            configureDtmfCall();
            mocks
              .audioSession
              .get
              .mockReturnValue(
                createAudioSession(
                  socket.socket
                )
              );

            mocks
              .standardInputRouter
              .routeStandardInput
              .mockReturnValue({
                matched: true,
                confidence: 1,
                resultingNodeId: "end",
                transition: "END_CALL",
                action: "NAVIGATE",
                optionLabel: "End call",
              });

            mocks
              .ivrGraphExecutor
              .executeIVRGraphRoute
              .mockResolvedValue({
                status: "ENDED",
                currentNodeId: "end",
                nextNodeId: null,
                speechText: "Thank you for calling. Goodbye.",
                awaitInput: false,
                endCall: true,
                transitionReason: "END_CALL",
              });

            mocks
              .voiceWorker
              .addText
              .mockResolvedValue(true);

            mocks
              .voiceWorker
              .start
              .mockImplementation(
                async () => {
                  mocks
                    .conversationState
                    .setState(
                      CALL_ID,
                      "ENDED"
                    );
                }
              );

            await TwilioStreamGateway.handle(
              socket.socket,
              JSON.stringify({
                event: "dtmf",
                streamSid: STREAM_SID,
                dtmf: { digit: "0" },
              })
            );

            const states =
              mocks
                .conversationState
                .setState
                .mock.calls
                .map(call => call[1]);

            expect(states).toContain(
              "TERMINATING"
            );
            expect(states).toContain(
              "ENDED"
            );
            expect(
              states.indexOf(
                "TERMINATING"
              )
            ).toBeLessThan(
              states.lastIndexOf(
                "ENDED"
              )
            );
          }
        );

        it(
          "terminates directly when END_CALL has no speech",
          async () => {
            const socket =
              createSocket();

            configureDtmfCall();
            mocks
              .audioSession
              .get
              .mockReturnValue(
                createAudioSession(
                  socket.socket
                )
              );

            mocks
              .standardInputRouter
              .routeStandardInput
              .mockReturnValue({
                matched: true,
                confidence: 1,
                resultingNodeId: "end",
                transition: "END_CALL",
                action: "NAVIGATE",
                optionLabel: "End call",
              });

            mocks
              .ivrGraphExecutor
              .executeIVRGraphRoute
              .mockResolvedValue({
                status: "ENDED",
                currentNodeId: "end",
                nextNodeId: null,
                speechText: null,
                awaitInput: false,
                endCall: true,
                transitionReason: "END_CALL",
              });

            await TwilioStreamGateway.handle(
              socket.socket,
              JSON.stringify({
                event: "dtmf",
                streamSid: STREAM_SID,
                dtmf: { digit: "0" },
              })
            );

            expect(
              mocks
                .voiceWorker
                .addText
            ).not.toHaveBeenCalled();

            expect(
              mocks
                .conversationState
                .setState
            ).toHaveBeenCalledWith(
              CALL_ID,
              "ENDED"
            );
          }
        );

        it(
          "ignores DTMF after the session starts terminating",
          async () => {
            const socket =
              createSocket();

            mocks
              .audioSession
              .get
              .mockReturnValue(
                createAudioSession(
                  socket.socket
                )
              );

            mocks
              .conversationState
              .getState
              .mockReturnValue(
                "TERMINATING"
              );

            await TwilioStreamGateway.handle(
              socket.socket,
              JSON.stringify({
                event: "dtmf",
                streamSid: STREAM_SID,
                dtmf: { digit: "1" },
              })
            );

            expect(
              mocks
                .standardInputRouter
                .routeStandardInput
            ).not.toHaveBeenCalled();

            expect(
              mocks
                .ivrGraphExecutor
                .executeIVRGraphRoute
            ).not.toHaveBeenCalled();
          }
        );
      }
    );
  }
);
