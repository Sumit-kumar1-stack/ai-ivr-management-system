export interface TTSAudioChunk {
  id: string;

  callId: string;

  generationId?: string;

  text: string;

  audio: Buffer;

  createdAt: Date;
}
