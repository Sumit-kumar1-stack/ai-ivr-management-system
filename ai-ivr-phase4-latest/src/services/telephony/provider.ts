import {
  CallRequest,
  CallResponse,
} from "./types";

export interface TelephonyProvider {

  makeCall(
    request: CallRequest
  ): Promise<CallResponse>;

  endCall(
    callId: string
  ): Promise<void>;

}