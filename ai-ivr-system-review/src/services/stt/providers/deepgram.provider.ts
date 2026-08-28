import { STTProvider } from "./base-stt.provider";
import { DeepgramService } from "../deepgram.service";

export class DeepgramProvider
  implements STTProvider {

  async connect(
    callId: string
  ) {

    await DeepgramService.connect(
      callId
    );

  }

  async sendAudio(

    callId: string,

    audio: Buffer

  ) {

    await DeepgramService.sendAudio(

      callId,

      audio

    );

  }

  async disconnect(
    callId: string
  ) {

    await DeepgramService.close(
      callId
    );

  }

}