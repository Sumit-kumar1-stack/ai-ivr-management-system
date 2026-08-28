import {
  ProviderCallRequest,
  CallResponse,
} from "@/services/telephony/types";


export abstract class BaseTelephonyProvider {


  abstract makeCall(
    request: ProviderCallRequest
  ): Promise<CallResponse>;



  abstract endCall(
    callId: string
  ): Promise<void>;



  abstract handleWebhook(
    body: unknown
  ): Promise<void>;


}