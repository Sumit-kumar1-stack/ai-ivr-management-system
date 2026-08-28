export interface STTProvider {

  connect(
    callId: string
  ): Promise<void>;

  sendAudio(
    callId: string,
    audio: Buffer
  ): Promise<void>;

  disconnect(
    callId: string
  ): Promise<void>;

}