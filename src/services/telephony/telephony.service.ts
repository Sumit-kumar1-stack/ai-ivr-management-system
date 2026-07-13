import { getTelephonyProvider } from "./factory";
import { CallRequest } from "./types";

import {
  createCall,
  updateCall,
} from "../calls/call.service";

import { createConversation } from "@/services/conversations/conversation.service";
import { mapProviderStatus } from "@/providers/telephony/status-map";

export async function startCall(request: CallRequest) {
  const provider = getTelephonyProvider();

  // Create call record
  const call = await createCall({
    campaignId: request.campaignId,
    contactId: request.contactId,
    phone: request.to,
    language: request.language,
  });

  // Create conversation linked to the call
  await createConversation(call.id);

  // Start provider call
  const result = await provider.makeCall(request);

  // Convert provider string status to Prisma CallStatus enum
  const status = mapProviderStatus(result.status);

  // Update call
  await updateCall(call.id, {
    providerCallId: result.callId,
    status,
    startedAt: new Date(),
  });

  return {
    callId: call.id,
    providerCallId: result.callId,
    status,
  };
}