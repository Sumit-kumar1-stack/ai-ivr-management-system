import { WebSocket } from "ws";

import { AudioRouter } from "./audio-router.service";

import { AudioChunk } from "./audio-stream.types";

interface Session {

    callId: string;

    streamSid: string;

    socket: WebSocket;

}

const sessions =
    new Map<string, Session>();

const streamIndex =
    new Map<string, string>();

export class AudioSessionService {

    //----------------------------------------
    // Create Session
    //----------------------------------------

    static create(session: Session) {

        sessions.set(
            session.callId,
            session
        );

        streamIndex.set(
            session.streamSid,
            session.callId
        );

        console.log(
            `🎧 Audio session created (${session.callId})`
        );

    }

    //----------------------------------------
    // Close Session
    //----------------------------------------

    static close(streamSid: string) {

        const callId =
            streamIndex.get(streamSid);

        if (!callId) {

            return;

        }

        sessions.delete(callId);

        streamIndex.delete(streamSid);

        console.log(
            `🔌 Audio session closed (${callId})`
        );

    }

    //----------------------------------------
    // Incoming Audio
    //----------------------------------------

    static async handleIncomingAudio(

        streamSid: string,

        payload: string

    ) {

        const callId =
            streamIndex.get(streamSid);

        if (!callId) {

            return;

        }

        await AudioRouter.routeIncoming({

            callId,

            data: Buffer.from(
                payload,
                "base64"
            ),

            timestamp: Date.now(),

        } satisfies AudioChunk);

    }

    //----------------------------------------
    // Outgoing Audio
    //----------------------------------------

    static async sendAudio(

        callId: string,

        audio: Buffer

    ) {

        const session =
            sessions.get(callId);

        if (!session) {

            return;

        }

        session.socket.send(

            JSON.stringify({

                event: "media",

                streamSid:
                    session.streamSid,

                media: {

                    payload:
                        audio.toString("base64"),

                },

            })

        );

    }

    //----------------------------------------

    static isConnected(
        callId: string
    ) {

        return sessions.has(callId);

    }

}