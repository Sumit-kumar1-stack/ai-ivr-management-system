import {
  TwilioHumanTransferAdapter,
} from "@/providers/telephony/twilio-human-transfer.adapter";
import {
  ExotelHumanTransferAdapter,
} from "@/providers/telephony/exotel-human-transfer.adapter";
import {
  PlivoHumanTransferAdapter,
} from "@/providers/telephony/plivo-human-transfer.adapter";

import {
  getHumanTransferAdapter,
  registerHumanTransferAdapter,
} from "./human-transfer-registry.service";

//--------------------------------------------------
// State
//--------------------------------------------------

let initialized =
  false;

//--------------------------------------------------
// Register Adapters
//--------------------------------------------------

export function registerHumanTransferAdapters():
  void {
  if (
    initialized
  ) {
    return;
  }

  if (!getHumanTransferAdapter("EXOTEL")) {
    registerHumanTransferAdapter(new ExotelHumanTransferAdapter());
  }

  if (!getHumanTransferAdapter("PLIVO")) {
    registerHumanTransferAdapter(new PlivoHumanTransferAdapter());
  }

  //------------------------------------------------
  // Twilio
  //------------------------------------------------

  if (
    !getHumanTransferAdapter(
      "TWILIO"
    )
  ) {
    registerHumanTransferAdapter(
      new TwilioHumanTransferAdapter()
    );
  }

  initialized =
    true;
}
