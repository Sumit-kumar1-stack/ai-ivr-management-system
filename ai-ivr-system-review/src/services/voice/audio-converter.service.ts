import {
  Buffer,
} from "buffer";

//--------------------------------------------------
// Audio Converter
//--------------------------------------------------

export class AudioConverter {
  private static readonly GEMINI_INPUT_SAMPLE_RATE =
    16000;

  private static readonly GEMINI_OUTPUT_SAMPLE_RATE =
    24000;

  private static readonly TWILIO_SAMPLE_RATE =
    8000;

  //--------------------------------------------------
  // Twilio μ-law 8 kHz → Gemini PCM16 16 kHz
  //--------------------------------------------------

  static mulaw8kToPcm16k(
    mulawAudio:
      Buffer
  ): Buffer {
    if (
      !Buffer.isBuffer(
        mulawAudio
      )
    ) {
      throw new TypeError(
        "μ-law audio must be a Buffer"
      );
    }

    if (
      mulawAudio.length ===
      0
    ) {
      throw new Error(
        "μ-law audio buffer is empty"
      );
    }

    //------------------------------------------------
    // Decode G.711 μ-law → PCM16 @ 8 kHz
    //------------------------------------------------

    const pcm8k =
      new Int16Array(
        mulawAudio.length
      );

    for (
      let index = 0;
      index <
      mulawAudio.length;
      index++
    ) {
      pcm8k[index] =
        this.mulawToLinear(
          mulawAudio[index]
        );
    }

    //------------------------------------------------
    // Upsample 8 kHz → 16 kHz
    //------------------------------------------------

    const pcm16k =
      this.upsample(
        pcm8k,
        this.TWILIO_SAMPLE_RATE,
        this.GEMINI_INPUT_SAMPLE_RATE
      );

    //------------------------------------------------
    // Int16Array → little-endian PCM Buffer
    //------------------------------------------------

    const output =
      Buffer.alloc(
        pcm16k.length *
          2
      );

    for (
      let index = 0;
      index <
      pcm16k.length;
      index++
    ) {
      output.writeInt16LE(
        pcm16k[index],
        index * 2
      );
    }

    return output;
  }

  //--------------------------------------------------
  // Gemini PCM16 24 kHz → Twilio μ-law 8 kHz
  //--------------------------------------------------

  static pcm24kToMulaw8k(
    pcmAudio:
      Buffer
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
      pcmAudio.length ===
      0
    ) {
      throw new Error(
        "PCM audio buffer is empty"
      );
    }

    if (
      pcmAudio.length %
        2 !==
      0
    ) {
      throw new Error(
        "Invalid PCM16 buffer length"
      );
    }

    //----------------------------------------------
    // Decode signed 16-bit little-endian PCM
    //----------------------------------------------

    const inputSampleCount =
      pcmAudio.length /
      2;

    const inputSamples =
      new Int16Array(
        inputSampleCount
      );

    for (
      let index = 0;
      index <
      inputSampleCount;
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
        this.GEMINI_OUTPUT_SAMPLE_RATE,
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
      index <
      downsampled.length;
      index++
    ) {
      mulaw[index] =
        this.linearToMulaw(
          downsampled[
            index
          ]
        );
    }

    return mulaw;
  }

  //--------------------------------------------------
  // Upsample PCM
  //
  // Current telephony bridge uses linear
  // interpolation. This is intentionally small and
  // dependency-free for the first Gemini Live path.
  //--------------------------------------------------

  private static upsample(
    input:
      Int16Array,

    inputRate:
      number,

    outputRate:
      number
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
      outputRate <
      inputRate
    ) {
      throw new Error(
        "Upsample output rate must not be below input rate"
      );
    }

    if (
      inputRate ===
      outputRate
    ) {
      return input;
    }

    const ratio =
      outputRate /
      inputRate;

    const outputLength =
      Math.floor(
        input.length *
          ratio
      );

    const output =
      new Int16Array(
        outputLength
      );

    for (
      let outputIndex = 0;
      outputIndex <
      outputLength;
      outputIndex++
    ) {
      const sourcePosition =
        outputIndex /
        ratio;

      const leftIndex =
        Math.floor(
          sourcePosition
        );

      const rightIndex =
        Math.min(
          leftIndex + 1,
          input.length - 1
        );

      const fraction =
        sourcePosition -
        leftIndex;

      const leftSample =
        input[leftIndex] ??
        0;

      const rightSample =
        input[rightIndex] ??
        leftSample;

      output[outputIndex] =
        Math.round(
          leftSample +
            (
              rightSample -
              leftSample
            ) *
              fraction
        );
    }

    return output;
  }

  //--------------------------------------------------
  // Downsample PCM
  //--------------------------------------------------

  private static downsample(
    input:
      Int16Array,

    inputRate:
      number,

    outputRate:
      number
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
      outputRate >
      inputRate
    ) {
      throw new Error(
        "This converter only supports downsampling"
      );
    }

    if (
      inputRate ===
      outputRate
    ) {
      return input;
    }

    const ratio =
      inputRate /
      outputRate;

    const outputLength =
      Math.floor(
        input.length /
          ratio
      );

    const output =
      new Int16Array(
        outputLength
      );

    for (
      let outputIndex = 0;
      outputIndex <
      outputLength;
      outputIndex++
    ) {
      const start =
        Math.floor(
          outputIndex *
            ratio
        );

      const end =
        Math.min(
          Math.floor(
            (
              outputIndex +
              1
            ) *
              ratio
          ),
          input.length
        );

      let sum =
        0;

      let count =
        0;

      for (
        let inputIndex =
          start;
        inputIndex <
        end;
        inputIndex++
      ) {
        sum +=
          input[
            inputIndex
          ];

        count++;
      }

      output[outputIndex] =
        count > 0
          ? Math.round(
              sum /
                count
            )
          : 0;
    }

    return output;
  }

  //--------------------------------------------------
  // G.711 μ-law byte → PCM16 sample
  //--------------------------------------------------

  private static mulawToLinear(
    value:
      number
  ): number {
    const decoded =
      (
        ~value
      ) &
      0xff;

    const sign =
      decoded &
      0x80;

    const exponent =
      (
        decoded >>
        4
      ) &
      0x07;

    const mantissa =
      decoded &
      0x0f;

    let sample =
      (
        (
          mantissa <<
          3
        ) +
        0x84
      ) <<
      exponent;

    sample -=
      0x84;

    return sign
      ? -sample
      : sample;
  }

  //--------------------------------------------------
  // PCM16 sample → G.711 μ-law byte
  //--------------------------------------------------

  private static linearToMulaw(
    sample:
      number
  ): number {
    const BIAS =
      0x84;

    const CLIP =
      32635;

    let sign =
      0;

    if (
      sample <
      0
    ) {
      sign =
        0x80;

      sample =
        -sample;
    }

    if (
      sample >
      CLIP
    ) {
      sample =
        CLIP;
    }

    sample +=
      BIAS;

    let exponent =
      7;

    for (
      let mask =
        0x4000;
      (
        sample &
        mask
      ) ===
        0 &&
      exponent >
        0;
      mask >>=
        1
    ) {
      exponent--;
    }

    const mantissa =
      (
        sample >>
        (
          exponent +
          3
        )
      ) &
      0x0f;

    return (
      ~(
        sign |
        (
          exponent <<
          4
        ) |
        mantissa
      )
    ) &
      0xff;
  }
}