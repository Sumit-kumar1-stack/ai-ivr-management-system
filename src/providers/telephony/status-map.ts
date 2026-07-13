export function mapProviderStatus(
  status: string
) {
  switch (status.toLowerCase()) {
    case "ringing":
      return "RINGING";

    case "answered":
      return "ANSWERED";

    case "completed":
      return "COMPLETED";

    case "busy":
      return "BUSY";

    case "failed":
      return "FAILED";

    case "no-answer":
      return "NO_ANSWER";

    default:
      return "FAILED";
  }
}