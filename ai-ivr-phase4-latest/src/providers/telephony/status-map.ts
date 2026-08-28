import {
  CallStatus,
} from "@prisma/client";

export function mapProviderStatus(
  status: string
): CallStatus {
  const normalizedStatus =
    status
      .trim()
      .toLowerCase();

  switch (normalizedStatus) {
    case "queued":
    case "initiated":
      return CallStatus.QUEUED;

    case "ringing":
      return CallStatus.RINGING;

    case "answered":
    case "in-progress":
      return CallStatus.ANSWERED;

    case "completed":
      return CallStatus.COMPLETED;

    case "busy":
      return CallStatus.BUSY;

    case "no-answer":
      return CallStatus.NO_ANSWER;

    case "canceled":
    case "cancelled":
      return CallStatus.CANCELED;

    case "failed":
      return CallStatus.FAILED;

    default:
      console.warn(
        "Unknown provider call status",
        {
          status,
        }
      );

      return CallStatus.FAILED;
  }
}