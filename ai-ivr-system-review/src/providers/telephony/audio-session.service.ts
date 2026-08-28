import {
  WebSocket,
} from "ws";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  CommunicationVoiceRuntime,
} from "@/config/communication-plan";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface AudioSession {
  callId:
    string;

  twilioCallSid:
    string;

  streamSid:
    string;

  socket:
    WebSocket;

  voiceRuntime:
    CommunicationVoiceRuntime;

  requestedRuntime:
    CommunicationVoiceRuntime;

  effectiveRuntime:
    CommunicationVoiceRuntime;

  fallbackUsed:
    boolean;

  fallbackReason:
    string | null;

  createdAt:
    number;
}

interface CreateAudioSessionInput {
  callId:
    string;

  twilioCallSid:
    string;

  streamSid:
    string;

  socket:
    WebSocket;

  voiceRuntime?:
    CommunicationVoiceRuntime;

  requestedRuntime?:
    CommunicationVoiceRuntime;

  effectiveRuntime?:
    CommunicationVoiceRuntime;

  fallbackUsed?:
    boolean;

  fallbackReason?:
    string | null;
}

type CloseListener =
  (
    callId: string
  ) => void;

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "audio-session-service"
  );

//--------------------------------------------------
// Audio Session Manager
//--------------------------------------------------

class AudioSessionManager {
  private sessionsByStreamSid =
    new Map<
      string,
      AudioSession
    >();

  private streamSidByCallId =
    new Map<
      string,
      string
    >();

  private closeListeners:
    CloseListener[] =
    [];

  //--------------------------------------------
  // Register Close Listener
  //--------------------------------------------

  onClose(
    listener:
      CloseListener
  ): void {
    this.closeListeners.push(
      listener
    );
  }

  //--------------------------------------------
  // Create
  //--------------------------------------------

  create(
    input:
      CreateAudioSessionInput
  ): AudioSession {
    const log =
      createCallLogger(
        input.callId
      );

    const previousStreamSid =
      this.streamSidByCallId.get(
        input.callId
      );

    const replacedPreviousSession =
      Boolean(
        previousStreamSid &&
        previousStreamSid !==
          input.streamSid
      );

    if (
      previousStreamSid &&
      previousStreamSid !==
        input.streamSid
    ) {
      this.sessionsByStreamSid.delete(
        previousStreamSid
      );
    }

const session:
  AudioSession = {
    ...input,

    voiceRuntime:
      input.voiceRuntime ??
      "CASCADED",

    requestedRuntime:
      input.requestedRuntime ??
      input.voiceRuntime ??
      "CASCADED",

    effectiveRuntime:
      input.effectiveRuntime ??
      input.voiceRuntime ??
      "CASCADED",

    fallbackUsed:
      input.fallbackUsed ??
      false,

    fallbackReason:
      input.fallbackReason ??
      null,

    createdAt:
      Date.now(),
  };
    this.sessionsByStreamSid.set(
      session.streamSid,
      session
    );

    this.streamSidByCallId.set(
      session.callId,
      session.streamSid
    );

    log.info(
      {
        event:
          "audio.session.created",

        twilioCallSidPresent:
          Boolean(
            session.twilioCallSid
          ),

        streamSidPresent:
          Boolean(
            session.streamSid
          ),

        replacedPreviousSession,

        readyState:
          session.socket
            .readyState,

        activeSessionCount:
          this.sessionsByStreamSid
            .size,
      },
      "Audio session created"
    );

    return session;
  }

  //--------------------------------------------
  // Get By Stream SID
  //--------------------------------------------

  get(
    streamSid: string
  ): AudioSession | undefined {
    return this
      .sessionsByStreamSid
      .get(
        streamSid
      );
  }

  //--------------------------------------------
  // Get By Internal Call ID
  //--------------------------------------------

  getByCallId(
    callId: string
  ): AudioSession | undefined {
    const streamSid =
      this.streamSidByCallId.get(
        callId
      );

    if (
      !streamSid
    ) {
      return undefined;
    }

    return this
      .sessionsByStreamSid
      .get(
        streamSid
      );
  }

  //--------------------------------------------
  // Check Whether Call Has A Live Socket
  //--------------------------------------------

  isReady(
    callId: string
  ): boolean {
    const session =
      this.getByCallId(
        callId
      );

    return Boolean(
      session &&
      session.socket
        .readyState ===
        WebSocket.OPEN
    );
  }

  //--------------------------------------------
  // Wait For Twilio Socket
  //--------------------------------------------

  async waitForCall(
    callId: string,
    timeoutMs =
      20_000,
    pollIntervalMs =
      100
  ): Promise<AudioSession> {
    const startedAt =
      Date.now();

    while (
      Date.now() -
        startedAt <
      timeoutMs
    ) {
      const session =
        this.getByCallId(
          callId
        );

      if (
        session &&
        session.socket
          .readyState ===
          WebSocket.OPEN
      ) {
        return session;
      }

      await new Promise<void>(
        resolve => {
          setTimeout(
            resolve,
            pollIntervalMs
          );
        }
      );
    }

    throw new Error(
      `Timed out waiting for Twilio Media Stream after ${timeoutMs}ms`
    );
  }

  //--------------------------------------------
  // Send Audio By Internal Call ID
  //--------------------------------------------

  sendAudioByCallId(
    callId: string,
    audio: Buffer
  ): boolean {
    const log =
      createCallLogger(
        callId
      );

    const session =
      this.getByCallId(
        callId
      );

    if (
      !session
    ) {
      log.warn(
        {
          event:
            "audio.send.rejected",

          reason:
            "session_not_found",

          audioSizeBytes:
            audio.length,
        },
        "Twilio audio session was not found"
      );

      return false;
    }

    return this.sendAudioToSession(
      session,
      audio
    );
  }

  //--------------------------------------------
  // Send Audio By Stream SID
  //--------------------------------------------

  sendAudio(
    streamSid: string,
    audio: Buffer
  ): boolean {
    const session =
      this.get(
        streamSid
      );

    if (
      !session
    ) {
      serviceLog.warn(
        {
          event:
            "audio.send.rejected",

          reason:
            "stream_session_not_found",

          streamSidPresent:
            Boolean(
              streamSid
            ),

          audioSizeBytes:
            audio.length,
        },
        "Twilio stream audio session was not found"
      );

      return false;
    }

    return this.sendAudioToSession(
      session,
      audio
    );
  }

  //--------------------------------------------
  // Internal Outbound Media Sender
  //--------------------------------------------

  private sendAudioToSession(
    session: AudioSession,
    audio: Buffer
  ): boolean {
    const log =
      createCallLogger(
        session.callId
      );

    if (
      session.socket
        .readyState !==
      WebSocket.OPEN
    ) {
      log.warn(
        {
          event:
            "audio.send.rejected",

          reason:
            "socket_not_open",

          readyState:
            session.socket
              .readyState,

          audioSizeBytes:
            audio.length,
        },
        "Twilio WebSocket is not open"
      );

      return false;
    }

    if (
      !Buffer.isBuffer(
        audio
      ) ||
      audio.length ===
        0
    ) {
      log.warn(
        {
          event:
            "audio.send.rejected",

          reason:
            "invalid_audio_buffer",
        },
        "Invalid Twilio audio buffer"
      );

      return false;
    }

    try {
      session.socket.send(
        JSON.stringify({
          event:
            "media",

          streamSid:
            session.streamSid,

          media: {
            payload:
              audio.toString(
                "base64"
              ),
          },
        })
      );

      log.debug(
        {
          event:
            "audio.send.completed",

          audioSizeBytes:
            audio.length,

          streamSidPresent:
            true,
        },
        "Twilio audio sent"
      );

      return true;
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "audio.send.failed",

          audioSizeBytes:
            audio.length,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to send Twilio audio"
      );

      return false;
    }
  }

  //--------------------------------------------
  // Clear Buffered Twilio Playback
  //--------------------------------------------

  clearPlayback(
    callId: string
  ): boolean {
    const log =
      createCallLogger(
        callId
      );

    const session =
      this.getByCallId(
        callId
      );

    if (
      !session ||
      session.socket
        .readyState !==
        WebSocket.OPEN
    ) {
      return false;
    }

    try {
      session.socket.send(
        JSON.stringify({
          event:
            "clear",

          streamSid:
            session.streamSid,
        })
      );

      log.info(
        {
          event:
            "audio.playback.cleared",
        },
        "Twilio playback cleared"
      );

      return true;
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "audio.playback.clear_failed",

          error:
            normalizeError(
              error
            ),
        },
        "Failed to clear Twilio playback"
      );

      return false;
    }
  }

  //--------------------------------------------
  // Close
  //--------------------------------------------

  close(
    streamSid: string
  ): void {
    const session =
      this.get(
        streamSid
      );

    if (
      !session
    ) {
      return;
    }

    const log =
      createCallLogger(
        session.callId
      );

    for (
      const listener of
      this.closeListeners
    ) {
      try {
        listener(
          session.callId
        );
      } catch (
        error
      ) {
        log.error(
          {
            event:
              "audio.session.close_listener_failed",

            error:
              normalizeError(
                error
              ),
          },
          "Audio session close listener failed"
        );
      }
    }

    this.sessionsByStreamSid.delete(
      streamSid
    );

    const mappedStreamSid =
      this.streamSidByCallId.get(
        session.callId
      );

    if (
      mappedStreamSid ===
      streamSid
    ) {
      this.streamSidByCallId.delete(
        session.callId
      );
    }

    log.info(
      {
        event:
          "audio.session.closed",

        lifetimeMs:
          Math.max(
            0,
            Date.now() -
              session.createdAt
          ),

        activeSessionCount:
          this.sessionsByStreamSid
            .size,
      },
      "Audio session closed"
    );
  }

  //--------------------------------------------
  // Close Using Internal ID
  //--------------------------------------------

  closeByCallId(
    callId: string
  ): void {
    const streamSid =
      this.streamSidByCallId.get(
        callId
      );

    if (
      !streamSid
    ) {
      return;
    }

    this.close(
      streamSid
    );
  }
}

export const AudioSessionService =
  new AudioSessionManager();
