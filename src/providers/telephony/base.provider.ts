import {
  CallRequest,
  CallResponse,
} from "@/services/telephony/types";

export abstract class BaseTelephonyProvider {
  abstract makeCall(
    request: CallRequest
  ): Promise<CallResponse>;

  abstract endCall(
    callId: string
  ): Promise<void>;
}