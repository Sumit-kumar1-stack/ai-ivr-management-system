import {
  TwilioSmsAdapter,
} from "@/providers/messaging/twilio-sms.adapter";

import {
  MetaWhatsAppAdapter,
} from "@/providers/messaging/meta-whatsapp.adapter";

import {
  getMessagingProvider,
  registerMessagingProvider,
} from "./messaging-provider-registry.service";

//--------------------------------------------------
// Register
//--------------------------------------------------

export function registerMessagingProviders():
  void {
  //------------------------------------------------
  // Twilio SMS
  //------------------------------------------------

  if (
    !getMessagingProvider(
      "TWILIO"
    )
  ) {
    registerMessagingProvider(
      new TwilioSmsAdapter()
    );
  }

  //------------------------------------------------
  // Meta WhatsApp
  //------------------------------------------------

  if (
    !getMessagingProvider(
      "META"
    )
  ) {
    registerMessagingProvider(
      new MetaWhatsAppAdapter()
    );
  }
}