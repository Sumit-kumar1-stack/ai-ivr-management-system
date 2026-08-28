import {
  MockProvider,
} from "./mock.provider";

import {
  TwilioProvider,
} from "./twilio.provider";
import {
  ExotelProvider,
} from "./exotel.provider";
import { PlivoProvider } from "./plivo.provider";

import {
  BaseTelephonyProvider,
} from "./base.provider";


export class ProviderFactory {

  static getProvider():
    BaseTelephonyProvider {
    return ProviderFactory.getProviderForName(ProviderFactory.getProviderName());
  }

  /** Resolve the persisted provider for an active call, not process defaults. */
  static getProviderForName(provider: string): BaseTelephonyProvider {
    const normalized = provider.trim().toLowerCase();

    switch (normalized) {

      case "twilio":

        return new TwilioProvider();

      case "exotel":
        return new ExotelProvider();

      case "plivo":
        return new PlivoProvider();


      case "mock":

        return new MockProvider();


      default:

        throw new Error(
          "Invalid telephony provider. " +
          'Expected "twilio", "exotel", "plivo", or "mock".'
        );

    }

  }

  static getProviderName(): "twilio" | "exotel" | "plivo" | "mock" {
    const provider = (process.env.TELEPHONY_PROVIDER ?? "twilio").trim().toLowerCase();
    if (provider === "twilio" || provider === "exotel" || provider === "plivo" || provider === "mock") return provider;
    throw new Error('Invalid TELEPHONY_PROVIDER. Expected "twilio", "exotel", "plivo", or "mock".');
  }

}
