import {
  CallStatus,
} from "@prisma/client";

import {
  WebSocket,
} from "ws";

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  startConversation,
} from "@/services/conversations/conversation-engine.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  STTProviderFactory,
} from "@/services/stt/providers/provider.factory";

import {
  GeminiLiveMediaService,
} from "@/services/voice/gemini-live-media.service";

import {
  resolveCommunicationVoiceRuntime,
} from "@/services/communication/communication-entitlement.service";

import {
  getCallSecuritySession,
} from "@/services/security/call-security-session.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

type TwilioStartEvent = {
  event:
    "start";

  streamSid?:
    string;

  start: {
    streamSid?:
      string;

    callSid?:
      string;

    customParameters?: {
      callId?:
        string;

      twilioCallSid?:
        string;

      direction?:
        string;

      [key: string]:
        string | undefined;
    };
  };
};

type TwilioMediaEvent = {
  event:
    "media";

  streamSid:
    string;

  media: {
    payload?:
      string;
  };
};

type TwilioMarkEvent = {
  event:
    "mark";

  streamSid?:
    string;

  mark?: {
    name?:
      string;
  };
};

type TwilioStopEvent = {
  event:
    "stop";

  streamSid:
    string;
};

type TwilioConnectedEvent = {
  event:
    "connected";
};

type TwilioEvent =
  | TwilioConnectedEvent
  | TwilioStartEvent
  | TwilioMediaEvent
  | TwilioMarkEvent
  | TwilioStopEvent;

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-stream-gateway"
  );

//--------------------------------------------------
// Twilio Stream Gateway
//--------------------------------------------------

export class TwilioStreamGateway {
  //------------------------------------------------
  // Handle Incoming WebSocket Message
  //------------------------------------------------

  static async handle(
    socket:
      WebSocket,

    message:
      string
  ): Promise<void> {
    let event:
      TwilioEvent;

    try {
      event =
        JSON.parse(
          message
        ) as TwilioEvent;
    } catch (
      error
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.message_rejected",

          reason:
            "invalid_json",

          messageSizeBytes:
            Buffer.byteLength(
              message,
              "utf8"
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Invalid Twilio WebSocket message"
      );

      return;
    }

    switch (
      event.event
    ) {
      //--------------------------------------------
      // Connected
      //--------------------------------------------

      case "connected": {
        serviceLog.debug(
          {
            event:
              "twilio.stream.connected_event_received",
          },
          "Twilio WebSocket connected event received"
        );

        return;
      }

      //--------------------------------------------
      // Start
      //--------------------------------------------

      case "start": {
        await this.handleStart(
          socket,
          event
        );

        return;
      }

      //--------------------------------------------
      // Incoming Audio
      //--------------------------------------------

      case "media": {
        await this.handleMedia(
          event
        );

        return;
      }

      //--------------------------------------------
      // Playback Mark
      //--------------------------------------------

      case "mark": {
        serviceLog.debug(
          {
            event:
              "twilio.stream.mark_received",

            streamSidPresent:
              Boolean(
                event.streamSid
              ),

            markNamePresent:
              Boolean(
                event.mark
                  ?.name
              ),
          },
          "Twilio playback mark received"
        );

        return;
      }

      //--------------------------------------------
      // Stop
      //--------------------------------------------

      case "stop": {
        await this.handleStop(
          event
        );

        return;
      }

      //--------------------------------------------
      // Unknown Event
      //--------------------------------------------

      default: {
        serviceLog.debug(
          {
            event:
              "twilio.stream.event_ignored",
          },
          "Unknown Twilio stream event ignored"
        );
      }
    }
  }

  //------------------------------------------------
  // Handle Start Event
  //------------------------------------------------

  private static async handleStart(
    socket:
      WebSocket,

    event:
      TwilioStartEvent
  ): Promise<void> {
    const streamSid =
      (
        event.start
          .streamSid ||
        event.streamSid ||
        ""
      ).trim();

    const twilioCallSid =
      (
        event.start
          .callSid ||
        ""
      ).trim();

    const internalCallId =
      (
        event.start
          .customParameters
          ?.callId ||
        ""
      ).trim();

    const customTwilioCallSid =
      (
        event.start
          .customParameters
          ?.twilioCallSid ||
        ""
      ).trim();

    serviceLog.info(
      {
        event:
          "twilio.stream.start_received",

        streamSidPresent:
          Boolean(
            streamSid
          ),

        twilioCallSidPresent:
          Boolean(
            twilioCallSid
          ),

        internalCallIdPresent:
          Boolean(
            internalCallId
          ),

        customParameterCount:
          Object.keys(
            event.start
              .customParameters ??
            {}
          ).length,
      },
      "Twilio stream start event received"
    );

    //----------------------------------------------
    // Require Internal Application Call ID
    //----------------------------------------------

    if (
      !internalCallId
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "missing_internal_call_id",

          streamSidPresent:
            Boolean(
              streamSid
            ),

          twilioCallSidPresent:
            Boolean(
              twilioCallSid
            ),
        },
        "Twilio start event is missing internal call ID"
      );

      socket.close(
        1008,
        "Missing internal call ID"
      );

      return;
    }

    const log =
      createCallLogger(
        internalCallId
      );

    //----------------------------------------------
    // Validate Stream SID
    //----------------------------------------------

    if (
      !streamSid
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "missing_stream_sid",
        },
        "Twilio start event is missing stream SID"
      );

      socket.close(
        1008,
        "Missing stream SID"
      );

      return;
    }

    //----------------------------------------------
    // Validate Twilio Call SID
    //----------------------------------------------

    if (
      !twilioCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "missing_provider_call_id",
        },
        "Twilio start event is missing CallSid"
      );

      socket.close(
        1008,
        "Missing provider call ID"
      );

      return;
    }

    //----------------------------------------------
    // Validate TwiML Custom CallSid
    //----------------------------------------------

    /*
     * The CallSid supplied in the TwiML custom
     * parameters must match Twilio's actual
     * start-event CallSid.
     */

    if (
      customTwilioCallSid &&
      customTwilioCallSid !==
        twilioCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "custom_provider_id_mismatch",

          customProviderIdPresent:
            true,

          startProviderIdPresent:
            true,
        },
        "Twilio start identifiers did not match"
      );

      socket.close(
        1008,
        "Call association mismatch"
      );

      return;
    }

    //----------------------------------------------
    // Load Internal Call + Communication Runtime
    //----------------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            internalCallId,
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

          campaign: {
            select: {
              communicationVoiceParent: {
                select: {
                  id:
                    true,

                  tier:
                    true,
                },
              },
            },
          },
        },
      });

    //----------------------------------------------
    // Call Must Exist
    //----------------------------------------------

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "internal_call_not_found",
        },
        "Internal call record was not found"
      );

      socket.close(
        1008,
        "Call not found"
      );

      return;
    }

    //----------------------------------------------
    // Reject Terminal Calls
    //----------------------------------------------

    if (
      isTerminalStatus(
        call.status
      )
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "call_already_terminal",

          callStatus:
            call.status,
        },
        "Twilio stream rejected because call is already terminal"
      );

      socket.close(
        1008,
        "Call already ended"
      );

      return;
    }

    //----------------------------------------------
    // Validate Existing Provider Association
    //----------------------------------------------

    if (
      call.providerCallId &&
      call.providerCallId !==
        twilioCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.stream.start_rejected",

          reason:
            "stored_provider_id_mismatch",

          storedProviderIdPresent:
            true,

          incomingProviderIdPresent:
            true,
        },
        "Stored call association did not match Twilio start event"
      );

      socket.close(
        1008,
        "Call association mismatch"
      );

      return;
    }

    //----------------------------------------------
    // Associate Missing Provider Call ID
    //----------------------------------------------

    if (
      !call.providerCallId
    ) {
      const association =
        await prisma.call.updateMany({
          where: {
            id:
              internalCallId,

            providerCallId:
              null,
          },

          data: {
            providerCallId:
              twilioCallSid,
          },
        });

      /*
       * A concurrent callback may have associated
       * the CallSid first.
       *
       * If our compare-and-set lost the race,
       * re-read and verify the final association.
       */

      if (
        association.count ===
        0
      ) {
        const associatedCall =
          await prisma.call.findUnique({
            where: {
              id:
                internalCallId,
            },

            select: {
              providerCallId:
                true,
            },
          });

        if (
          associatedCall
            ?.providerCallId !==
          twilioCallSid
        ) {
          log.warn(
            {
              event:
                "twilio.stream.start_rejected",

              reason:
                "provider_id_association_conflict",
            },
            "Twilio CallSid association conflicted with another request"
          );

          socket.close(
            1008,
            "Call association conflict"
          );

          return;
        }
      }

      log.info(
        {
          event:
            "twilio.stream.provider_id_associated",

          updatedRecordCount:
            association.count,

          providerCallIdPresent:
            true,
        },
        "Twilio provider call ID associated"
      );
    }

    //----------------------------------------------
    // M10 — Resolve Per-Call Voice Runtime
    //----------------------------------------------

    const communicationVoiceParent =
      call
        .campaign
        .communicationVoiceParent;

    const requestedRuntime =
      communicationVoiceParent
        ? resolveCommunicationVoiceRuntime(
            communicationVoiceParent
              .tier
          )
        : "CASCADED";

    let effectiveRuntime =
      requestedRuntime;

    let fallbackUsed =
      false;

    let fallbackReason:
      string | null =
        null;

    log.info(
      {
        event:
          "twilio.stream.runtime_resolved",

        requestedRuntime,

        effectiveRuntime,

        fallbackUsed,

        fallbackReason,

        communicationCampaignId:
          communicationVoiceParent
            ?.id ?? null,
      },
      "Twilio stream runtime resolved"
    );

    //----------------------------------------------
    // Premium Runtime Audit
    //----------------------------------------------

    /*
     * A Premium communication call must never enter
     * the Standard:
     *
     * Deepgram → Gemini → TTS
     *
     * pipeline.
     */

    if (requestedRuntime === "GEMINI_LIVE") {
      log.info(
        {
          event:
            "twilio.stream.premium_runtime_selected",

          requestedRuntime,

          communicationCampaignId:
            communicationVoiceParent
              ?.id ??
            null,
        },
        "Premium Gemini Live media runtime selected"
      );
    }

    //----------------------------------------------
    // Handle Duplicate / Replacement Stream
    //----------------------------------------------

    const previousSession =
      AudioSessionService
        .getByCallId(
          internalCallId
        );

    if (
      previousSession
    ) {
      //--------------------------------------------
      // Exact Duplicate
      //--------------------------------------------

      if (
        previousSession.streamSid ===
          streamSid &&
        previousSession.socket ===
          socket
      ) {
        log.debug(
          {
            event:
              "twilio.stream.start_duplicate_ignored",

            streamSidPresent:
              true,
          },
          "Duplicate Twilio start event ignored"
        );

        return;
      }

      //--------------------------------------------
      // Replacement Stream
      //--------------------------------------------

      log.warn(
        {
          event:
            "twilio.stream.previous_session_replaced",

          previousStreamPresent:
            true,

          newStreamPresent:
            true,
        },
        "Replacing an existing Twilio audio session"
      );

      //--------------------------------------------
      // Close Previous Voice Runtime
      //--------------------------------------------

      if (
        previousSession
          .voiceRuntime ===
        "GEMINI_LIVE"
      ) {
        GeminiLiveMediaService.close(
          internalCallId
        );
      } else {
        try {
          await STTProviderFactory
            .get()
            .disconnect(
              internalCallId
            );
        } catch (
          error
        ) {
          log.warn(
            {
              event:
                "twilio.stream.previous_stt_disconnect_failed",

              error:
                normalizeError(
                  error
                ),
            },
            "Previous STT session could not be disconnected"
          );
      }
    }

      //--------------------------------------------
      // Close Previous Audio Session
      //--------------------------------------------

      AudioSessionService.close(
        previousSession.streamSid
      );
    }

    //----------------------------------------------
    // Ensure Conversation Record Exists
    //----------------------------------------------

    const conversation =
      await prisma.conversation.upsert({
        where: {
          callId:
            internalCallId,
        },

        update: {},

        create: {
          callId:
            internalCallId,
        },

        select: {
          id:
            true,
        },
      });

    //----------------------------------------------
    // Determine New vs Resumed Conversation
    //----------------------------------------------

    const existingMessageCount =
      await prisma.conversationMessage.count({
        where: {
          conversationId:
            conversation.id,
        },
      });

    //----------------------------------------------
    // Register Audio Session
    //----------------------------------------------

    const audioSession =
      AudioSessionService.create({
      callId:
        internalCallId,

      twilioCallSid,

      streamSid,

      socket,

      voiceRuntime:
        effectiveRuntime,

      requestedRuntime,

      effectiveRuntime,

      fallbackUsed,

      fallbackReason,
    });

    //----------------------------------------------
    // Stream Started
    //----------------------------------------------

    log.info(
      {
        event:
          "twilio.stream.started",

        streamSidPresent:
          true,

        twilioCallSidPresent:
          true,

        direction:
          call.direction,

        requestedRuntime,

        effectiveRuntime,

        fallbackUsed,

        fallbackReason,

        existingConversationMessageCount:
          existingMessageCount,

        customParameterCount:
          Object.keys(
            event.start
              .customParameters ??
            {}
          ).length,
      },
      "Twilio media stream started"
    );

    //----------------------------------------------
    // PREMIUM — Gemini Live Runtime
    //----------------------------------------------

    if (
      requestedRuntime ===
      "GEMINI_LIVE"
    ) {
      let conversationEstablished =
        false;

      try {
        //------------------------------------------
        // Connect Native-Audio Session
        //------------------------------------------

        await GeminiLiveMediaService
          .start({
            callId:
              internalCallId,

            streamSid,

            newConversation:
              existingMessageCount ===
              0,
          });

        //------------------------------------------
        // Audio Transport Ready
        //------------------------------------------

        await EventPublisher.publish(
          AppEvent.AUDIO_CONNECTED,
          {
            callId:
              internalCallId,

            runtime:
              "GEMINI_LIVE",

            timestamp:
              Date.now(),
          }
        );

        await EventPublisher.publish(
          AppEvent.AI_SESSION_STARTED,
          {
            callId:
              internalCallId,

            runtime:
              "GEMINI_LIVE",

            requestedRuntime,

            effectiveRuntime:
              "GEMINI_LIVE",

            actorType:
              "SYSTEM",

            timestamp:
              Date.now(),
          }
        );

        //------------------------------------------
        // Start / Resume Premium Conversation
        //------------------------------------------

        await GeminiLiveMediaService
          .beginConversation(
            internalCallId
          );

        conversationEstablished =
          true;

        //------------------------------------------
        // Premium Runtime Ready
        //------------------------------------------

        log.info(
          {
            event:
              "twilio.stream.gemini_live_initialized",

            requestedRuntime,

            effectiveRuntime:
              "GEMINI_LIVE",

            fallbackUsed:
              false,

            fallbackReason:
              null,

            newConversation:
              existingMessageCount ===
              0,

            existingConversationMessageCount:
              existingMessageCount,

            conversationState:
              ConversationStateService
                .getState(
                  internalCallId
                ),
          },
          "Premium Gemini Live call stream initialized"
        );
      } catch (
        error
      ) {
        //------------------------------------------
        // Fail Closed or Fallback
        //
        // Premium may fall back to the existing
        // CASCADED runtime only before a live
        // conversational Gemini session exists.
        //------------------------------------------

        if (
          !conversationEstablished
        ) {
          let securitySession:
            Awaited<
              ReturnType<
                typeof getCallSecuritySession
              >
            > |
            null =
              null;

          try {
            securitySession =
              await getCallSecuritySession(
                internalCallId
              );
          } catch {
            securitySession =
              null;
          }

          const conversationState =
            ConversationStateService
              .getState(
                internalCallId
              );

          const canFallbackSafely =
            Boolean(
              securitySession
            ) &&
            conversationState !==
              "ENDED";

          if (
            !canFallbackSafely
          ) {
            const fallbackReason =
              !securitySession
                ? "security_session_unavailable"
                : "conversation_already_ended";

            log.error(
              {
                event:
                  "twilio.stream.gemini_live_fallback_blocked",

                requestedRuntime,

                effectiveRuntime:
                  "GEMINI_LIVE",

                fallbackUsed:
                  false,

                fallbackReason,

                authenticationLevel:
                  securitySession
                    ?.authenticationLevel ??
                  null,

                riskLevel:
                  securitySession?.riskLevel ??
                  null,

                allowedActionCount:
                  securitySession
                    ?.allowedActions.length ??
                  0,

                conversationState,

                error:
                  normalizeError(
                    error
                  ),
              },
              "Gemini Live initialization failed; fallback blocked to preserve security state"
            );

            ConversationStateService.setState(
              internalCallId,
              "ENDED"
            );

            GeminiLiveMediaService.close(
              internalCallId
            );

            AudioSessionService.close(
              streamSid
            );

            socket.close(
              1011,
              "Premium fallback blocked"
            );

            return;
          }

          fallbackUsed =
            true;

          fallbackReason =
            normalizeError(
              error
            ).message;

          effectiveRuntime =
            "CASCADED";

          audioSession.voiceRuntime =
            effectiveRuntime;

          audioSession.effectiveRuntime =
            effectiveRuntime;

          audioSession.fallbackUsed =
            true;

          audioSession.fallbackReason =
            fallbackReason;

          void EventPublisher.publish(
            AppEvent.FALLBACK_TRIGGERED,
            {
              callId:
                internalCallId,

              requestedRuntime,

              effectiveRuntime,

              fallbackUsed,

              fallbackReason,

              actorType:
                "SYSTEM",

              timestamp:
                Date.now(),
            }
          );

          void EventPublisher.publish(
            AppEvent.PROVIDER_CHANGED,
            {
              callId:
                internalCallId,

              requestedRuntime,

              effectiveRuntime,

              fallbackUsed,

              fallbackReason,

              actorType:
                "SYSTEM",

              timestamp:
                Date.now(),
            }
          );

          log.warn(
            {
              event:
                "twilio.stream.gemini_live_fallback_to_cascaded",

              requestedRuntime,

              effectiveRuntime,

              fallbackUsed,

              fallbackReason,

              error:
                normalizeError(
                  error
                ),
            },
            "Gemini Live initialization failed; falling back to cascaded runtime"
          );

          GeminiLiveMediaService.close(
            internalCallId
          );
        } else {
          log.error(
            {
              event:
                "twilio.stream.gemini_live_initialization_failed",

              requestedRuntime,

              effectiveRuntime:
                "GEMINI_LIVE",

              fallbackUsed:
                false,

              fallbackReason:
                null,

              error:
                normalizeError(
                  error
                ),
            },
            "Gemini Live initialization failed"
          );

          ConversationStateService.setState(
            internalCallId,
            "ENDED"
          );

          GeminiLiveMediaService.close(
            internalCallId
          );

            AudioSessionService.close(
              streamSid
            );

          socket.close(
            1011,
            "Gemini Live initialization failed"
          );

          return;
        }
      }

      //--------------------------------------------
      // CRITICAL
      //
      // Premium only enters the Standard branch when
      // early Gemini initialization failed and the
      // fallback was explicitly selected above.
      //--------------------------------------------

      if (
        effectiveRuntime ===
        "GEMINI_LIVE"
      ) {
        return;
      }
    }

    //----------------------------------------------
    // STANDARD / LEGACY — Connect STT
    //----------------------------------------------

    try {
      log.info(
        {
          event:
            "twilio.stream.cascaded_pipeline_init_started",

          requestedRuntime,

          effectiveRuntime,

          fallbackUsed,

          fallbackReason,
        },
        "Cascaded voice pipeline initialization started"
      );

      await STTProviderFactory
        .get()
        .connect(
          internalCallId
        );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.stream.stt_connection_failed",

          requestedRuntime,

          effectiveRuntime,

          fallbackUsed,

          fallbackReason,

          error:
            normalizeError(
              error
            ),
        },
        "STT connection failed"
      );

      ConversationStateService.setState(
        internalCallId,
        "ENDED"
      );

      AudioSessionService.close(
        streamSid
      );

      socket.close(
        1011,
        "STT connection failed"
      );

      return;
    }

    log.info(
      {
        event:
          "twilio.stream.cascaded_pipeline_init_completed",

        requestedRuntime,

        effectiveRuntime,

        fallbackUsed,

        fallbackReason,
      },
      "Cascaded voice pipeline initialization completed"
    );

    //----------------------------------------------
    // Standard Audio Connection Ready
    //----------------------------------------------

    await EventPublisher.publish(
      AppEvent.AUDIO_CONNECTED,
      {
        callId:
          internalCallId,

        timestamp:
          Date.now(),
      }
    );

    await EventPublisher.publish(
      AppEvent.AI_SESSION_STARTED,
      {
        callId:
          internalCallId,

        runtime:
          "CASCADED",

        requestedRuntime,

        effectiveRuntime,

        actorType:
          "SYSTEM",

        timestamp:
          Date.now(),
      }
    );

    //----------------------------------------------
    // Standard Conversation State
    //----------------------------------------------

    ConversationStateService.setState(
      internalCallId,
      "LISTENING"
    );

    //----------------------------------------------
    // New Standard Conversation
    //----------------------------------------------

    if (
      existingMessageCount ===
      0
    ) {
      await EventPublisher.publish(
        AppEvent.CONVERSATION_STARTED,
        {
          callId:
            internalCallId,

          timestamp:
            Date.now(),
        }
      );

      const greetingQueued =
        await startConversation(
          internalCallId
        );

      log.info(
        {
          event:
            "twilio.stream.conversation_started",

          greetingQueued,
        },
        "AI conversation initialized"
      );
    } else {
      //--------------------------------------------
      // Replacement Standard Stream
      //
      // Resume without replaying the greeting.
      //--------------------------------------------

      await EventPublisher.publish(
        AppEvent.VOICE_LISTENING,
        {
          callId:
            internalCallId,

          timestamp:
            Date.now(),
        }
      );

      log.info(
        {
          event:
            "twilio.stream.conversation_resumed",

          existingConversationMessageCount:
            existingMessageCount,

          conversationState:
            "LISTENING",
        },
        "Existing AI conversation resumed"
      );
    }

    //----------------------------------------------
    // Standard Runtime Ready
    //----------------------------------------------

    log.info(
      {
        event:
          "twilio.stream.initialized",

        requestedRuntime,

        effectiveRuntime,

        fallbackUsed,

        fallbackReason,

        conversationState:
          ConversationStateService
            .getState(
              internalCallId
            ),

        greetingRequired:
          existingMessageCount ===
          0,
      },
      "Twilio call stream initialized"
    );
  }

  //------------------------------------------------
  // Handle Media Event
  //------------------------------------------------

  private static async handleMedia(
    event:
      TwilioMediaEvent
  ): Promise<void> {
    const streamSid =
      event.streamSid
        ?.trim();

    //----------------------------------------------
    // Require Stream SID
    //----------------------------------------------

    if (
      !streamSid
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.media_ignored",

          reason:
            "missing_stream_sid",
        },
        "Twilio media event is missing stream SID"
      );

      return;
    }

    //----------------------------------------------
    // Resolve Registered Audio Session
    //----------------------------------------------

    const session =
      AudioSessionService.get(
        streamSid
      );

    if (
      !session
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.media_ignored",

          reason:
            "session_not_registered",

          streamSidPresent:
            true,
        },
        "Twilio audio received before session registration"
      );

      return;
    }

    //----------------------------------------------
    // Read Payload
    //----------------------------------------------

    const payload =
      event.media
        ?.payload
        ?.trim();

    if (
      !payload
    ) {
      return;
    }

    const log =
      createCallLogger(
        session.callId
      );

    //----------------------------------------------
    // Validate Base64
    //----------------------------------------------

    if (
      !isValidBase64(
        payload
      )
    ) {
      log.warn(
        {
          event:
            "twilio.stream.media_rejected",

          reason:
            "invalid_base64",

          encodedPayloadLength:
            payload.length,
        },
        "Twilio media payload was not valid base64"
      );

      return;
    }

    //----------------------------------------------
    // Decode μ-law Payload
    //----------------------------------------------

    const audio =
      Buffer.from(
        payload,
        "base64"
      );

    if (
      audio.length ===
      0
    ) {
      return;
    }

    //----------------------------------------------
    // PREMIUM — Twilio → Gemini Live
    //----------------------------------------------

    if (
      session.voiceRuntime ===
      "GEMINI_LIVE"
    ) {
      try {
        GeminiLiveMediaService
          .sendTwilioAudio(
            session.callId,
            audio
          );
      } catch (
        error
      ) {
        log.error(
          {
            event:
              "twilio.stream.gemini_live_audio_forward_failed",

            audioSizeBytes:
              audio.length,

            error:
              normalizeError(
                error
              ),
          },
          "Failed to send Twilio audio to Gemini Live"
        );
      }

      /*
       * Important:
       *
       * A failed Premium audio forward does not
       * fall through to Deepgram.
       */

      return;
    }

    //----------------------------------------------
    // STANDARD / LEGACY — Twilio → STT
    //----------------------------------------------

    try {
      await STTProviderFactory
        .get()
        .sendAudio(
          session.callId,
          audio
        );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.stream.audio_forward_failed",

          audioSizeBytes:
            audio.length,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to send Twilio audio to STT"
      );
    }
  }

  //------------------------------------------------
  // Handle Stop Event
  //------------------------------------------------

  private static async handleStop(
    event:
      TwilioStopEvent
  ): Promise<void> {
    const streamSid =
      event.streamSid
        ?.trim();

    //----------------------------------------------
    // Require Stream SID
    //----------------------------------------------

    if (
      !streamSid
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.stop_ignored",

          reason:
            "missing_stream_sid",
        },
        "Twilio stop event is missing stream SID"
      );

      return;
    }

    //----------------------------------------------
    // Resolve Session
    //----------------------------------------------

    const session =
      AudioSessionService.get(
        streamSid
      );

    if (
      !session
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.stream.stop_ignored",

          reason:
            "session_not_found",

          streamSidPresent:
            true,
        },
        "Stopped Twilio stream had no audio session"
      );

      return;
    }

    const log =
      createCallLogger(
        session.callId
      );

    //----------------------------------------------
    // Disconnect Selected Runtime
    //----------------------------------------------

    try {
      if (
        session.voiceRuntime ===
        "GEMINI_LIVE"
      ) {
        GeminiLiveMediaService.close(
          session.callId
        );

        log.info(
          {
            event:
              "twilio.stream.gemini_live_disconnected",
          },
          "Gemini Live session disconnected"
        );
      } else {
        await STTProviderFactory
          .get()
          .disconnect(
            session.callId
          );

        log.info(
          {
            event:
              "twilio.stream.stt_disconnected",
          },
          "STT session disconnected"
        );
      }
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.stream.voice_runtime_disconnect_failed",

          voiceRuntime:
            session.voiceRuntime,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to disconnect voice runtime"
      );
    } finally {
      //--------------------------------------------
      // Conversation End State
      //--------------------------------------------

      ConversationStateService.setState(
        session.callId,
        "ENDED"
      );

      //--------------------------------------------
      // Publish Audio Disconnected
      //--------------------------------------------

      await EventPublisher.publish(
        AppEvent.AUDIO_DISCONNECTED,
        {
          callId:
            session.callId,

          timestamp:
            Date.now(),
        }
      );

      //--------------------------------------------
      // Remove Audio Session
      //--------------------------------------------

      AudioSessionService.close(
        streamSid
      );
    }

    //----------------------------------------------
    // Stop Complete
    //----------------------------------------------

    log.info(
      {
        event:
          "twilio.stream.stopped",

        voiceRuntime:
          session.voiceRuntime,
      },
      "Twilio media stream stopped"
    );
  }
}

//--------------------------------------------------
// Terminal Call Status
//--------------------------------------------------

function isTerminalStatus(
  status:
    CallStatus
): boolean {
  return (
    status ===
      CallStatus.COMPLETED ||
    status ===
      CallStatus.FAILED ||
    status ===
      CallStatus.BUSY ||
    status ===
      CallStatus.NO_ANSWER ||
    status ===
      CallStatus.CANCELED
  );
}

//--------------------------------------------------
// Conservative Base64 Validation
//--------------------------------------------------

function isValidBase64(
  value:
    string
): boolean {
  if (
    value.length ===
    0 ||
    value.length %
      4 ===
      1
  ) {
    return false;
  }

  return /^[A-Za-z0-9+/]+={0,2}$/.test(
    value
  );
}
