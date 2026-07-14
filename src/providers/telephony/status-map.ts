import { CallStatus } from "@prisma/client";

export function mapProviderStatus(status: string): CallStatus {

  switch (status.toLowerCase()) {

    case "queued":
      return CallStatus.QUEUED;

    case "ringing":
      return CallStatus.RINGING;

    case "answered":
      return CallStatus.ANSWERED;

    case "completed":
      return CallStatus.COMPLETED;

    case "busy":
      return CallStatus.BUSY;

    case "failed":
      return CallStatus.FAILED;

    default:
      return CallStatus.FAILED;
  }
}