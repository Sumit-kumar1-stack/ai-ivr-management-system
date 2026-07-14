export interface AudioChunk {

  id: string;

  callId: string;

  text: string;

  audio: Buffer;

  createdAt: Date;

}