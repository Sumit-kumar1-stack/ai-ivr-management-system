export interface AudioChunk {

    callId: string;

    data: Buffer;

    timestamp: number;

}

export interface AudioSession {

    callId: string;

    connected: boolean;

    startedAt: number;

}