import { ProviderFactory } from "@/providers/telephony/provider.factory";
import type {
  OutboundProviderCallRequest,
  OutboundProviderCallResult,
} from "@/providers/telephony/outbound-call.types";

export type ExecuteOutboundCallAttemptInput = OutboundProviderCallRequest;
export type ExecuteOutboundCallAttemptResult = OutboundProviderCallResult;

export async function executeOutboundCallAttempt(
  input: ExecuteOutboundCallAttemptInput
): Promise<ExecuteOutboundCallAttemptResult> {
  validate(input);
  const provider = ProviderFactory.getProviderForName(input.provider);

  if (!provider.capabilities.supportsOutbound) {
    throw new Error(`Provider ${input.provider.toUpperCase()} does not support outbound calls`);
  }

  return provider.executeOutboundCall({
    tenantId: input.tenantId.trim(),
    campaignId: input.campaignId.trim(),
    campaignRecipientId: input.campaignRecipientId.trim(),
    attemptId: input.attemptId.trim(),
    attemptNumber: input.attemptNumber,
    provider: input.provider.trim().toUpperCase(),
    from: input.from.trim(),
    to: input.to.trim(),
    answerUrl: input.answerUrl,
    statusCallbackUrl: input.statusCallbackUrl,
    recordingCallbackUrl: input.recordingCallbackUrl ?? null,
  });
}

function validate(input: ExecuteOutboundCallAttemptInput): void {
  const identifiers = [
    input.tenantId,
    input.campaignId,
    input.campaignRecipientId,
    input.attemptId,
    input.provider,
    input.from,
    input.to,
    input.answerUrl,
    input.statusCallbackUrl,
  ];

  if (identifiers.some(value => !value.trim())) {
    throw new Error("Outbound provider execution request is incomplete");
  }
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error("Outbound provider attempt number is invalid");
  }
  for (const callback of [input.answerUrl, input.statusCallbackUrl]) {
    const url = new URL(callback);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Outbound provider callbacks must use HTTP or HTTPS");
    }
  }
}
