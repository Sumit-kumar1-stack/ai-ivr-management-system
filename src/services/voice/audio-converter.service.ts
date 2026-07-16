import { Buffer } from "buffer";

export class AudioConverter {

  static async textToMulaw(
    text: string
  ): Promise<Buffer> {

    /**
     * Placeholder.
     *
     * Later this will receive PCM audio
     * from ElevenLabs/OpenAI TTS and
     * convert to:
     *
     * 8kHz
     * mono
     * μ-law
     */

    return Buffer.from(text);

  }

}