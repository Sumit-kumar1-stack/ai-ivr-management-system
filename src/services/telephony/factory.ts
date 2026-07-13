import { MockProvider } from "@/providers/telephony/mock.provider";
import { TelnyxProvider } from "@/providers/telephony/telnyx.provider";

export function getTelephonyProvider() {

  switch (
    process.env.TELEPHONY_PROVIDER
  ) {

    case "telnyx":
      return new TelnyxProvider();

    default:
      return new MockProvider();

  }

}