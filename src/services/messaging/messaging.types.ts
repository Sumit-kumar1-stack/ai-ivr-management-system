//--------------------------------------------------
// Channel
//--------------------------------------------------

export type MessagingChannel =
  | "SMS"
  | "WHATSAPP";

//--------------------------------------------------
// Provider
//--------------------------------------------------

export type MessagingProviderName =
  | "TWILIO"
  | "META"
  | "EXOTEL"
  | "PLIVO"
  | "MOCK";

//--------------------------------------------------
// WhatsApp Template Parameter
//--------------------------------------------------

export interface WhatsAppTemplateParameter {
  type:
    "text";

  text:
    string;
}

//--------------------------------------------------
// WhatsApp Template Component
//--------------------------------------------------

export interface WhatsAppTemplateComponent {
  type:
    "body";

  parameters:
    WhatsAppTemplateParameter[];
}

//--------------------------------------------------
// Send Request
//--------------------------------------------------

export interface MessagingSendRequest {
  channel:
    MessagingChannel;

  recipient:
    string;

  /*
   * SMS
   */
  body?:
    string;

  /*
   * WhatsApp
   */
  templateName?:
    string;

  templateLanguage?:
    string;

  templateComponents?:
    WhatsAppTemplateComponent[];

  statusCallbackUrl?:
    string;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Send Success
//--------------------------------------------------

export interface MessagingSendSuccess {
  success:
    true;

  provider:
    MessagingProviderName;

  channel:
    MessagingChannel;

  providerMessageId:
    string;

  status:
    string;
}

//--------------------------------------------------
// Send Failure
//--------------------------------------------------

export interface MessagingSendFailure {
  success:
    false;

  provider:
    MessagingProviderName;

  channel:
    MessagingChannel;

  code:
    string;

  message:
    string;
}

//--------------------------------------------------
// Result
//--------------------------------------------------

export type MessagingSendResult =
  | MessagingSendSuccess
  | MessagingSendFailure;

//--------------------------------------------------
// Adapter
//--------------------------------------------------

export interface MessagingProviderAdapter {
  readonly provider:
    MessagingProviderName;

  readonly channels:
    readonly MessagingChannel[];

  isConfigured():
    boolean;

  send(
    request:
      MessagingSendRequest
  ): Promise<MessagingSendResult>;
}