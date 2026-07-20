import { STTProvider } from "./base-stt.provider";
import { MockSTTProvider } from "./mock-stt.provider";
import { DeepgramProvider } from "./deepgram.provider";

export enum STTProviderType {
  MOCK,
  DEEPGRAM,
}

export class STTProviderFactory {

  static get(
    provider: STTProviderType = STTProviderType.DEEPGRAM
  ): STTProvider {

    switch (provider) {

      case STTProviderType.DEEPGRAM:
        return new DeepgramProvider();

      default:
        return new MockSTTProvider();

    }

  }

}