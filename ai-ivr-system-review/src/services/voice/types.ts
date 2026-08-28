export interface TTSAudioChunk {
  id: string;

  callId: string;

  text: string;

  audio: Buffer;

  createdAt: Date;
}