export interface SpeechProvider {

  start(callId: string): Promise<void>;

  stop(callId: string): Promise<void>;

  receiveAudio(
    callId: string,
    chunk: Buffer
  ): Promise<void>;

}