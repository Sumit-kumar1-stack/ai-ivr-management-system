//--------------------------------------------------
// Human Transfer Provider
//--------------------------------------------------

export type HumanTransferProvider =
  | "TWILIO"
  | "EXOTEL"
  | "PLIVO"
  | "TELNYX"
  | "MOCK";

//--------------------------------------------------
// Transfer Strategy
//--------------------------------------------------

export type HumanTransferStrategy =
  | "DIRECT_NUMBER"
  | "QUEUE"
  | "SIP";

//--------------------------------------------------
// Transfer Request
//--------------------------------------------------

export interface HumanTransferRequest {
  callId:
    string;

  providerCallId:
    string;

  provider:
    HumanTransferProvider;

  strategy:
    HumanTransferStrategy;

  destination:
    string;

  reason?:
    string;

  announcement?:
    string;

  timeoutSeconds?:
    number;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Transfer Result
//--------------------------------------------------

export interface HumanTransferSuccess {
  success:
    true;

  provider:
    HumanTransferProvider;

  providerCallId:
    string;

  destination:
    string;

  transferReference?:
    string;

  message:
    string;
}

export interface HumanTransferFailure {
  success:
    false;

  provider:
    HumanTransferProvider;

  providerCallId:
    string;

  code:
    string;

  message:
    string;
}

export type HumanTransferResult =
  | HumanTransferSuccess
  | HumanTransferFailure;

//--------------------------------------------------
// Transfer Adapter
//--------------------------------------------------

export interface HumanTransferAdapter {
  readonly provider:
    HumanTransferProvider;

  isConfigured():
    boolean;

  transfer(
    request:
      HumanTransferRequest
  ): Promise<HumanTransferResult>;
}