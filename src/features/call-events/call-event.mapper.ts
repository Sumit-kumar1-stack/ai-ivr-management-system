import { CallEvent } from "@prisma/client";

export interface CallEventDto {
  id: string;
  callId: string;
  type: string;
  message: string | null;
  metadata: unknown;
  createdAt: Date;
}

export function toCallEventDto(
  event: CallEvent
): CallEventDto {
  return {
    id: event.id,
    callId: event.callId,
    type: event.type,
    message: event.message,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}