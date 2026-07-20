import {
  silenceDetector,
} from "./silence-detector.service";

import {
  liveTranscript,
} from "./live-transcript.service";

import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

export async function onSpeechChunk(
  callId: string,
  text: string
) {

  console.log(
    "🎤 Partial:",
    text
  );

  liveTranscript.append(
    callId,
    text
  );

  silenceDetector.reset(
    callId,

    async () => {

      const finalText =
        liveTranscript.get(callId);

      if (!finalText) {

        return;

      }

      console.log(
        "🛑 Silence detected"
      );

      console.log(
        "Final Transcript:",
        finalText
      );

      liveTranscript.clear(callId);

      await TranscriptBuffer.addPartial(
    callId,
    finalText
);

    }

  );

}