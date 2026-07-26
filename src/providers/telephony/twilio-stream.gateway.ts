import {
  WebSocket,
} from "ws";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  STTProviderFactory,
} from "@/services/stt/providers/provider.factory";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

type TwilioStartEvent = {
  event: "start";

  streamSid?: string;

  start: {
    streamSid: string;

    callSid: string;

    customParameters?: {
      callId?: string;

      twilioCallSid?: string;

      [key: string]:
        string | undefined;
    };
  };
};

type TwilioMediaEvent = {
  event: "media";

  streamSid: string;

  media: {
    payload: string;
  };
};

type TwilioStopEvent = {
  event: "stop";

  streamSid: string;
};

type TwilioConnectedEvent = {
  event: "connected";
};

type TwilioEvent =
  | TwilioConnectedEvent
  | TwilioStartEvent
  | TwilioMediaEvent
  | TwilioStopEvent;

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
    } catch (error) {
      console.error(
        "Invalid Twilio WebSocket message",
        error
      );

      return;
    }

    switch (event.event) {
      //--------------------------------------
      // Connected
      //--------------------------------------

      case "connected": {
        console.log(
          "📞 Twilio WebSocket connected"
        );

        break;
      }

      //--------------------------------------
      // Start
      //--------------------------------------

      case "start": {
        const streamSid =
          event.start.streamSid ||
          event.streamSid;

        const twilioCallSid =
          event.start.callSid;

        const internalCallId =
          event.start
            .customParameters
            ?.callId;

        const callId =
          internalCallId ||
          twilioCallSid;

        if (!callId) {
          console.error(
            "Twilio start event is missing callId"
          );

          socket.close(
            1008,
            "Missing call ID"
          );

          return;
        }

        if (!streamSid) {
          console.error(
            `Twilio start event is missing streamSid for ${callId}`
          );

          socket.close(
            1008,
            "Missing stream SID"
          );

          return;
        }

        const log =
          createCallLogger(
            callId
          );

        log.info(
          {
            callId,

            twilioCallSid,

            streamSid,

            customParameters:
              event.start
                .customParameters,
          },
          "Media stream started"
        );

        //--------------------------------------
        // Register Twilio audio session
        //--------------------------------------

        AudioSessionService.create({
          callId,

          twilioCallSid,

          streamSid,

          socket,
        });

        console.log(
          `✅ Twilio socket registered (${callId})`
        );

        //--------------------------------------
        // Connect speech recognition
        //--------------------------------------

        try {
          await STTProviderFactory
            .get()
            .connect(
              callId
            );

          console.log(
            `✅ STT connected (${callId})`
          );

          //--------------------------------------
          // Call is ready for speech
          //--------------------------------------

          ConversationStateService.setState(
            callId,
            "LISTENING"
          );

          console.log(
            `📍 Call initialized in LISTENING state (${callId})`
          );
        } catch (error) {
          log.error(
            {
              error,
            },
            "STT connection failed"
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

        break;
      }

      //--------------------------------------
      // Incoming Twilio audio
      //--------------------------------------

      case "media": {
        const session =
          AudioSessionService.get(
            event.streamSid
          );

        if (!session) {
          console.warn(
            `Twilio audio received before session registration (${event.streamSid})`
          );

          return;
        }

        const payload =
          event.media?.payload;

        if (!payload) {
          return;
        }

        const audio =
          Buffer.from(
            payload,
            "base64"
          );

        if (
          audio.length === 0
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
        } catch (error) {
          console.error(
            `Failed to send Twilio audio to STT (${session.callId})`,
            error
          );
        }

        break;
      }

      //--------------------------------------
      // Stop
      //--------------------------------------

      case "stop": {
        const session =
          AudioSessionService.get(
            event.streamSid
          );

        if (!session) {
          console.warn(
            `No audio session for stopped stream ${event.streamSid}`
          );

          break;
        }

        try {
          await STTProviderFactory
            .get()
            .disconnect(
              session.callId
            );
        } catch (error) {
          console.error(
            `Failed to disconnect STT for ${session.callId}`,
            error
          );
        } finally {
          ConversationStateService.setState(
            session.callId,
            "ENDED"
          );

          AudioSessionService.close(
            event.streamSid
          );
        }

        break;
      }
    }
  }
}