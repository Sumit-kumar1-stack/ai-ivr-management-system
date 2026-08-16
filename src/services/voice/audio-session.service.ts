import {
  WebSocket,
} from "ws";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioRouter,
} from "./audio-router.service";

import {
  AudioChunk,
} from "./audio-stream.types";

//--------------------------------------------------
// Types
//--------------------------------------------------

interface Session {
  callId:
    string;

  streamSid:
    string;

  socket:
    WebSocket;
}

//--------------------------------------------------
// Session Storage
//--------------------------------------------------

const sessions =
  new Map<
    string,
    Session
  >();

const streamIndex =
  new Map<
    string,
    string
  >();

//--------------------------------------------------
// Audio Session Service
//--------------------------------------------------

export class AudioSessionService {
  //----------------------------------------
  // Create Session
  //----------------------------------------

  static create(
    session: Session
  ): void {
    sessions.set(
      session.callId,
      session
    );

    streamIndex.set(
      session.streamSid,
      session.callId
    );

    const log =
      createCallLogger(
        session.callId
      );

    log.info(
      {
        event:
          "voice.audio_session.created",

        streamSidPresent:
          Boolean(
            session.streamSid
          ),

        socketOpen:
          session.socket.readyState ===
          WebSocket.OPEN,
      },
      "Audio session created"
    );
  }

  //----------------------------------------
  // Close Session
  //----------------------------------------

  static close(
    streamSid: string
  ): void {
    const callId =
      streamIndex.get(
        streamSid
      );

    if (
      !callId
    ) {
      return;
    }

    sessions.delete(
      callId
    );

    streamIndex.delete(
      streamSid
    );

    const log =
      createCallLogger(
        callId
      );

    log.info(
      {
        event:
          "voice.audio_session.closed",

        streamSidPresent:
          true,
      },
      "Audio session closed"
    );
  }

  //----------------------------------------
  // Incoming Audio
  //----------------------------------------

  static async handleIncomingAudio(
    streamSid: string,
    payload: string
  ): Promise<void> {
    const callId =
      streamIndex.get(
        streamSid
      );

    if (
      !callId
    ) {
      return;
    }

    const data =
      Buffer.from(
        payload,
        "base64"
      );

    await AudioRouter.routeIncoming({
      callId,

      data,

      timestamp:
        Date.now(),
    } satisfies AudioChunk);
  }

  //----------------------------------------
  // Outgoing Audio
  //----------------------------------------

  static async sendAudio(
    callId: string,
    audio: Buffer
  ): Promise<void> {
    const session =
      sessions.get(
        callId
      );

    if (
      !session
    ) {
      return;
    }

    if (
      session.socket.readyState !==
      WebSocket.OPEN
    ) {
      const log =
        createCallLogger(
          callId
        );

      log.warn(
        {
          event:
            "voice.audio_send.skipped",

          reason:
            "socket_not_open",

          socketReadyState:
            session.socket.readyState,

          audioByteCount:
            audio.length,
        },
        "Audio send skipped"
      );

      return;
    }

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
  }

  //----------------------------------------
  // Connection State
  //----------------------------------------

  static isConnected(
    callId: string
  ): boolean {
    return sessions.has(
      callId
    );
  }
}