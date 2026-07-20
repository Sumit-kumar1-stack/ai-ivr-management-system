import {
  SpeechProvider,
} from "./speech-provider";

import {
  TranscriptBuffer,
} from "./transcript-buffer.service";

export class MockSTTProvider
  implements SpeechProvider {

  async start(
    callId: string
  ): Promise<void> {

    console.log(
      "🎤 Mock STT started",
      callId
    );

  }

  async stop(
    callId: string
  ): Promise<void> {

    console.log(
      "🛑 Mock STT stopped",
      callId
    );

  }

  async receiveAudio(
    callId: string,
    chunk: Buffer
  ): Promise<void> {

    // Simulate speech recognition
    const text = chunk.toString().trim();

    if (!text) {
      return;
    }

    // Forward transcript only.
    // TranscriptSubscriber will decide when to invoke
    // processUserMessage().
    await TranscriptBuffer.addPartial(
      callId,
      text
    );

  }

}