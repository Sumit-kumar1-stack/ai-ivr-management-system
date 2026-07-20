import { Prisma, CallEventType } from "@prisma/client";
import { CallEventRepository } from "./call-event.repository";

export class CallEventService {
  static async create(
    callId: string,
    type: CallEventType,
    message?: string,
    payload?: Prisma.InputJsonValue,
    metadata?: Prisma.InputJsonValue
  ) {
    return CallEventRepository.create({
      call: {
        connect: {
          id: callId,
        },
      },
      type,
      message,
      payload,
      metadata,
    });
  }
}