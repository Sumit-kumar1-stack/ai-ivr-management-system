import { STTProvider } from "./base-stt.provider";

import { STTSessionManager } from "../session-manager.service";

export class MockSTTProvider
  implements STTProvider {

  async connect(
    callId: string
  ) {

    STTSessionManager.create(
      callId,
      "mock"
    );

    console.log(
      `🎤 Mock STT Connected (${callId})`
    );

  }

  async sendAudio(
    callId: string,
    audio: Buffer
  ) {

    console.log(

      `📦 ${audio.length} bytes (${callId})`

    );

  }

  async disconnect(
    callId: string
  ) {

    STTSessionManager.remove(
      callId
    );

    console.log(
      `🔌 Mock STT Closed (${callId})`
    );

  }

}