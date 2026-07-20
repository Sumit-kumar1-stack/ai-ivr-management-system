import {
  WebSocket,
} from "ws";

export interface AudioSession {
  callId: string;

  twilioCallSid: string;

  streamSid: string;

  socket: WebSocket;

  createdAt: number;
}

interface CreateAudioSessionInput {
  callId: string;

  twilioCallSid: string;

  streamSid: string;

  socket: WebSocket;
}

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

  //--------------------------------------------
  // Create
  //--------------------------------------------

  create(
    input:
      CreateAudioSessionInput
  ): AudioSession {
    const previousStreamSid =
      this.streamSidByCallId.get(
        input.callId
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

    console.log(
      `🎧 Audio Session Created (${session.callId})`
    );

    console.log({
      callId:
        session.callId,

      twilioCallSid:
        session.twilioCallSid,

      streamSid:
        session.streamSid,
    });

    return session;
  }

  //--------------------------------------------
  // Get by stream SID
  //--------------------------------------------

  get(
    streamSid: string
  ): AudioSession | undefined {
    return this
      .sessionsByStreamSid
      .get(streamSid);
  }

  //--------------------------------------------
  // Get by internal call ID
  //--------------------------------------------

  getByCallId(
    callId: string
  ): AudioSession | undefined {
    const streamSid =
      this.streamSidByCallId.get(
        callId
      );

    if (!streamSid) {
      return undefined;
    }

    return this
      .sessionsByStreamSid
      .get(streamSid);
  }

  //--------------------------------------------
  // Check whether a call has a live socket
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
  // Wait for Twilio socket
  //--------------------------------------------

  async waitForCall(
    callId: string,
    timeoutMs = 20000,
    pollIntervalMs = 100
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
        (resolve) => {
          setTimeout(
            resolve,
            pollIntervalMs
          );
        }
      );
    }

    throw new Error(
      `Timed out waiting for Twilio Media Stream for call ${callId}`
    );
  }

  //--------------------------------------------
  // Send audio by internal call ID
  //--------------------------------------------

  sendAudioByCallId(
    callId: string,
    audio: Buffer
  ): boolean {
    const session =
      this.getByCallId(
        callId
      );

    if (!session) {
      console.error(
        `No Twilio audio session for call ${callId}`
      );

      return false;
    }

    return this.sendAudioToSession(
      session,
      audio
    );
  }

  //--------------------------------------------
  // Send audio by stream SID
  //--------------------------------------------

  sendAudio(
    streamSid: string,
    audio: Buffer
  ): boolean {
    const session =
      this.get(
        streamSid
      );

    if (!session) {
      console.error(
        `No Twilio audio session for stream ${streamSid}`
      );

      return false;
    }

    return this.sendAudioToSession(
      session,
      audio
    );
  }

  //--------------------------------------------
  // Internal outbound media sender
  //--------------------------------------------

  private sendAudioToSession(
    session: AudioSession,
    audio: Buffer
  ): boolean {
    if (
      session.socket
        .readyState !==
      WebSocket.OPEN
    ) {
      console.error(
        `Twilio WebSocket is not open for call ${session.callId}`
      );

      return false;
    }

    if (
      !Buffer.isBuffer(
        audio
      ) ||
      audio.length === 0
    ) {
      console.error(
        `Invalid audio buffer for call ${session.callId}`
      );

      return false;
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

    console.log(
      `📤 Twilio audio sent (${session.callId})`
    );

    console.log({
      streamSid:
        session.streamSid,

      bytes:
        audio.length,
    });

    return true;
  }

  //--------------------------------------------
  // Clear buffered Twilio playback
  //--------------------------------------------

  clearPlayback(
    callId: string
  ): boolean {
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

    session.socket.send(
      JSON.stringify({
        event:
          "clear",

        streamSid:
          session.streamSid,
      })
    );

    console.log(
      `🛑 Twilio playback cleared (${callId})`
    );

    return true;
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

    if (!session) {
      return;
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

    console.log(
      `🔌 Audio Session Closed (${session.callId})`
    );
  }

  //--------------------------------------------
  // Close using internal ID
  //--------------------------------------------

  closeByCallId(
    callId: string
  ): void {
    const streamSid =
      this.streamSidByCallId.get(
        callId
      );

    if (!streamSid) {
      return;
    }

    this.close(
      streamSid
    );
  }
}

export const AudioSessionService =
  new AudioSessionManager();