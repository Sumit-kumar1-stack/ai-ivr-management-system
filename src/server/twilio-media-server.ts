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
  shouldPreserveCallAfterMediaStop,
} from "@/services/telephony/human-transfer-lifecycle.service";

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
  static async handle(
    socket: WebSocket,
    message: string
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
      //--------------------------------------
      // Connected
      //--------------------------------------

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

      //--------------------------------------
      // Start
      //--------------------------------------

      case "start": {
        await this.handleStart(
          socket,
          event
        );

        return;
      }

      //--------------------------------------
      // Incoming Twilio Audio
      //--------------------------------------

      case "media": {
        await this.handleMedia(
          event
        );

        return;
      }

      //--------------------------------------
      // Playback Mark
      //--------------------------------------

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

      //--------------------------------------
      // Stop
      //--------------------------------------

      case "stop": {
        await this.handleStop(
          event
        );

        return;
      }

      //--------------------------------------
      // Unknown Event
      //--------------------------------------

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

    //----------------------------------------------
    // Require Internal Application ID
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
    // Validate Required Provider Identifiers
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

    /*
     * The CallSid passed in TwiML custom parameters
     * must match the CallSid supplied by Twilio.
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
    // Load And Validate Internal Call
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
        },
      });

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
       * A concurrent callback may have associated the
       * CallSid first. Verify the final stored value.
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
    // Handle Duplicate Or Replacement Stream
    //----------------------------------------------

    const previousSession =
      AudioSessionService
        .getByCallId(
          internalCallId
        );

    if (
      previousSession
    ) {
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

    AudioSessionService.create({
      callId:
        internalCallId,

      twilioCallSid,

      streamSid,

      socket,
    });

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
    // Connect Speech-To-Text
    //----------------------------------------------

    try {
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

    //----------------------------------------------
    // Publish Audio Connection
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

    //----------------------------------------------
    // Start New Conversation Or Resume
    //----------------------------------------------

    ConversationStateService.setState(
      internalCallId,
      "LISTENING"
    );

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
      /*
       * A replacement stream should resume the
       * existing conversation without repeating
       * the greeting or duplicating the message.
       */
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

    log.info(
      {
        event:
          "twilio.stream.initialized",

        conversationState:
          ConversationStateService.getState(
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

    try {
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
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.stream.stt_disconnect_failed",

          error:
            normalizeError(
              error
            ),
        },
        "Failed to disconnect STT"
      );
    } finally {
      //------------------------------------------------
      // Media Stream Stop != Always Phone Call End
      //------------------------------------------------

      const preserveCall =
        await shouldPreserveCallAfterMediaStop(
          session.callId
        );

      if (
        preserveCall
      ) {
        log.info(
          {
            event:
              "twilio.stream.stop_transfer_preserved",
          },
          "AI media stream stopped during human transfer; underlying call preserved"
        );
      } else {
        ConversationStateService.setState(
          session.callId,
          "ENDED"
        );
      }

      //------------------------------------------------
      // Publish Audio Disconnect
      //------------------------------------------------

      await EventPublisher.publish(
        AppEvent.AUDIO_DISCONNECTED,
        {
          callId:
            session.callId,

          timestamp:
            Date.now(),
        }
      );

      //------------------------------------------------
      // Media Session Is Always Closed
      //------------------------------------------------

      AudioSessionService.close(
        streamSid
      );
    }

    log.info(
      {
        event:
          "twilio.stream.stopped",
      },
      "Twilio media stream stopped"
    );
  }
}

//--------------------------------------------------
// Terminal Call Status
//--------------------------------------------------

function isTerminalStatus(
  status: CallStatus
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
  value: string
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