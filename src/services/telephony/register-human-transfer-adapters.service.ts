import {
  TwilioHumanTransferAdapter,
} from "@/providers/telephony/twilio-human-transfer.adapter";

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