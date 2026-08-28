import {
  MockProvider,
} from "./mock.provider";

import {
  TwilioProvider,
} from "./twilio.provider";

import {
  BaseTelephonyProvider,
} from "./base.provider";


export class ProviderFactory {

  static getProvider():
    BaseTelephonyProvider {

    const provider =
      process.env
        .TELEPHONY_PROVIDER
        ?.trim()
        .toLowerCase();


    console.log(
      "TELEPHONY_PROVIDER =",
      provider
    );


    switch (provider) {

      case "twilio":

        console.log(
          "Using Twilio Provider"
        );

        return new TwilioProvider();


      case "mock":

        console.log(
          "Using Mock Provider"
        );

        return new MockProvider();


      default:

        throw new Error(
          "Invalid or missing TELEPHONY_PROVIDER. " +
          'Expected "twilio" or "mock".'
        );

    }

  }

}