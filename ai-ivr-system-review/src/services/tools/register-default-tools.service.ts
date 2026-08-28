import {
  bookCallbackTool,
} from "./book-callback.tool";

import {
  hasBusinessTool,
  registerBusinessTool,
} from "./tool-registry.service";

import {
  createLeadTool,
} from "./create-lead.tool";

import {
  transferToHumanTool,
} from "./transfer-to-human.tool";

import {
  sendSmsTool,
} from "./send-sms.tool";

import {
  sendWhatsAppTool,
} from "./send-whatsapp.tool";

import {
  recordConsentTool,
} from "./record-consent.tool";

import {
  searchKnowledgeBaseTool,
} from "./search-knowledge-base.tool";

import {
  endCallTool,
} from "./end-call.tool";

//--------------------------------------------------
// Tool Names
//--------------------------------------------------

export type BusinessToolName =
  | "searchKnowledgeBase"
  | "bookCallback"
  | "createLead"
  | "transferToHuman"
  | "sendSms"
  | "sendWhatsApp"
  | "endCall"
  | "recordConsent";

//--------------------------------------------------
// Registration State
//--------------------------------------------------

let initialized =
  false;

//--------------------------------------------------
// Register Default Business Tools
//--------------------------------------------------

export function registerDefaultBusinessTools():
  void {
  if (
    initialized
  ) {
    return;
  }

  //------------------------------------------------
  // Book Callback
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "bookCallback"
    )
  ) {
    registerBusinessTool(
      bookCallbackTool
    );
  }

  //------------------------------------------------
  // Create Lead
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "createLead"
    )
  ) {
    registerBusinessTool(
      createLeadTool
    );
  }

  //------------------------------------------------
// Search Knowledge Base
//------------------------------------------------

if (
  !hasBusinessTool(
    "searchKnowledgeBase"
  )
) {
  registerBusinessTool(
    searchKnowledgeBaseTool
  );
}

//------------------------------------------------
// End Call
//------------------------------------------------

if (
  !hasBusinessTool(
    "endCall"
  )
) {
  registerBusinessTool(
    endCallTool
  );
}

  //------------------------------------------------
  // Record Consent
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "recordConsent"
    )
  ) {
    registerBusinessTool(
      recordConsentTool
    );
  }

  //------------------------------------------------
  // Send WhatsApp
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "sendWhatsApp"
    )
  ) {
    registerBusinessTool(
      sendWhatsAppTool
    );
  }

  //------------------------------------------------
  // Transfer To Human
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "transferToHuman"
    )
  ) {
    registerBusinessTool(
      transferToHumanTool
    );
  }

  //------------------------------------------------
  // Send SMS
  //------------------------------------------------

  if (
    !hasBusinessTool(
      "sendSms"
    )
  ) {
    registerBusinessTool(
      sendSmsTool
    );
  }

  initialized =
    true;
}