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
// Capabilities
//--------------------------------------------------

export type MessagingProviderCapability =
  | "SMS_OUTBOUND"
  | "SMS_STATUS_CALLBACK"
  | "WHATSAPP_OUTBOUND"
  | "WHATSAPP_TEMPLATE"
  | "WHATSAPP_STATUS_CALLBACK"
  | "WHATSAPP_READ_RECEIPT";

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

  idempotencyKey?:
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

  retryable?:
    false;
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

  retryable?:
    boolean;
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

  readonly capabilities:
    readonly MessagingProviderCapability[];

  supports(
    channel:
      MessagingChannel,
    capability?:
      MessagingProviderCapability
  ): boolean;

  isConfigured():
    boolean;

  send(
    request:
      MessagingSendRequest
  ): Promise<MessagingSendResult>;
}

//--------------------------------------------------
// Resolution Options
//--------------------------------------------------

export interface ResolveMessagingProviderOptions {
  channel:
    MessagingChannel;

  capability?:
    MessagingProviderCapability;

  preferredProvider?:
    MessagingProviderName;
}

//--------------------------------------------------
// Capability Matrix
//--------------------------------------------------

export interface MessagingProviderCapabilityDescriptor {
  provider:
    MessagingProviderName;

  channels:
    readonly MessagingChannel[];

  capabilities:
    readonly MessagingProviderCapability[];

  isConfigured:
    boolean;
}

export type MessagingCapabilityMatrix = Record<
  MessagingProviderName,
  {
    channels:
      readonly MessagingChannel[];

    capabilities:
      readonly MessagingProviderCapability[];

    isConfigured:
      boolean;
  }
>;