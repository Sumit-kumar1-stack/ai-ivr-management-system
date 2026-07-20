import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
}

interface DeepgramPayload {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;

  channel?: {
    alternatives?: DeepgramAlternative[];
  };
}

export class DeepgramEvents {

  static async handle(
    callId: string,
    payload: DeepgramPayload
  ) {

    if (
      payload.type &&
      payload.type !== "Results"
    ) {
      return;
    }

    const transcript =
      payload.channel
        ?.alternatives?.[0]
        ?.transcript
        ?.trim() ?? "";

    if (!transcript) {
      return;
    }

    //----------------------------------
    // Update Current Hypothesis
    //----------------------------------

    await TranscriptBuffer.setPartial(
      callId,
      transcript
    );

    //----------------------------------
    // Final Utterance
    //----------------------------------

    if (
      payload.speech_final ||
      payload.is_final
    ) {

      console.log(
        `🟢 Deepgram final (${callId}):`,
        transcript
      );

      TranscriptBuffer.flush(
        callId
      );

    } else {

      console.log(
        `🟡 Deepgram partial (${callId}):`,
        transcript
      );

    }

  }

}