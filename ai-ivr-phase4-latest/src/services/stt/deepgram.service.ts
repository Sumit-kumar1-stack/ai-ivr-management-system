import { STTSessionManager } from "./session-manager.service";
import { DeepgramSocket } from "./deepgram.socket";

class DeepgramServiceClass {
  async connect(callId: string) {
    await DeepgramSocket.connect(callId);

    STTSessionManager.create(
      callId,
      "deepgram"
    );
  }

  async sendAudio(
    callId: string,
    audio: Buffer
  ) {
    await DeepgramSocket.sendAudio(
      callId,
      audio
    );
  }

  async close(callId: string) {
    await DeepgramSocket.close(callId);

    STTSessionManager.remove(callId);
  }
}

export const DeepgramService =
  new DeepgramServiceClass();