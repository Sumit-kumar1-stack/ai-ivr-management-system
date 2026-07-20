import {
  Buffer,
} from "buffer";

export class AudioConverter {

   private static readonly GEMINI_SAMPLE_RATE = 24000;

  private static readonly TWILIO_SAMPLE_RATE = 8000;


  //--------------------------------------------------
  // Gemini PCM 24 kHz → Twilio μ-law 8 kHz
  //--------------------------------------------------

  static pcm24kToMulaw8k(
    pcmAudio: Buffer
  ): Buffer {

    if (
      !Buffer.isBuffer(
        pcmAudio
      )
    ) {
      throw new TypeError(
        "PCM audio must be a Buffer"
      );
    }

    if (
      pcmAudio.length === 0
    ) {
      throw new Error(
        "PCM audio buffer is empty"
      );
    }

    if (
      pcmAudio.length % 2 !== 0
    ) {
      throw new Error(
        "Invalid PCM16 buffer length"
      );
    }

    //----------------------------------------------
    // Decode signed 16-bit little-endian PCM
    //----------------------------------------------

    const inputSampleCount =
      pcmAudio.length / 2;

    const inputSamples =
      new Int16Array(
        inputSampleCount
      );

    for (
      let index = 0;
      index < inputSampleCount;
      index++
    ) {
      inputSamples[index] =
        pcmAudio.readInt16LE(
          index * 2
        );
    }

    //----------------------------------------------
    // Downsample 24 kHz → 8 kHz
    //----------------------------------------------

    const downsampled =
      this.downsample(
        inputSamples,
        this.GEMINI_SAMPLE_RATE,
        this.TWILIO_SAMPLE_RATE
      );

    //----------------------------------------------
    // Encode PCM16 → G.711 μ-law
    //----------------------------------------------

    const mulaw =
      Buffer.alloc(
        downsampled.length
      );

    for (
      let index = 0;
      index < downsampled.length;
      index++
    ) {
      mulaw[index] =
        this.linearToMulaw(
          downsampled[index]
        );
    }

    return mulaw;
  }


  //--------------------------------------------------
  // Downsample PCM
  //--------------------------------------------------

  private static downsample(
    input: Int16Array,
    inputRate: number,
    outputRate: number
  ): Int16Array {

    if (
      inputRate <= 0 ||
      outputRate <= 0
    ) {
      throw new Error(
        "Sample rates must be positive"
      );
    }

    if (
      outputRate > inputRate
    ) {
      throw new Error(
        "This converter only supports downsampling"
      );
    }

    if (
      inputRate === outputRate
    ) {
      return input;
    }

    const ratio =
      inputRate / outputRate;

    const outputLength =
      Math.floor(
        input.length / ratio
      );

    const output =
      new Int16Array(
        outputLength
      );

    for (
      let outputIndex = 0;
      outputIndex < outputLength;
      outputIndex++
    ) {
      const start =
        Math.floor(
          outputIndex * ratio
        );

      const end =
        Math.min(
          Math.floor(
            (
              outputIndex + 1
            ) * ratio
          ),
          input.length
        );

      let sum = 0;

      let count = 0;

      for (
        let inputIndex = start;
        inputIndex < end;
        inputIndex++
      ) {
        sum +=
          input[inputIndex];

        count++;
      }

      output[outputIndex] =
        count > 0
          ? Math.round(
              sum / count
            )
          : 0;
    }

    return output;
  }


  //--------------------------------------------------
  // PCM16 sample → G.711 μ-law byte
  //--------------------------------------------------

  private static linearToMulaw(
    sample: number
  ): number {

    const BIAS =
      0x84;

    const CLIP =
      32635;

    let sign =
      0;

    if (
      sample < 0
    ) {
      sign =
        0x80;

      sample =
        -sample;
    }

    if (
      sample > CLIP
    ) {
      sample =
        CLIP;
    }

    sample +=
      BIAS;

    let exponent =
      7;

    for (
      let mask = 0x4000;
      (
        sample & mask
      ) === 0 &&
      exponent > 0;
      mask >>= 1
    ) {
      exponent--;
    }

    const mantissa =
      (
        sample >>
        (
          exponent + 3
        )
      ) &
      0x0f;

    return (
      ~(
        sign |
        (
          exponent << 4
        ) |
        mantissa
      )
    ) & 0xff;
  }
}