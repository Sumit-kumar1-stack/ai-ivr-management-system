import { Prisma, CallEventType } from "@prisma/client";
import { CallEventRepository } from "./call-event.repository";

export class CallEventService {
  static async create(
    callId: string,
    type: CallEventType,
    message?: string,
    metadata?: Record<string, unknown>
  ) {
    return CallEventRepository.create({
      call: {
        connect: {
          id: callId,
        },
      },
      type,
      message,
      metadata: metadata as Prisma.InputJsonValue,
    });
  }
}