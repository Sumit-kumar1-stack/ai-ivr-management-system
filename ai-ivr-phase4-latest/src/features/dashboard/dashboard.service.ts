import {
  DashboardRepository,
} from "./dashboard.repository";

function getLiveStatus(
  callStatus: string,
  latestEventType:
    | string
    | undefined
): string {
  switch (
    latestEventType
  ) {
    case "THINKING":
      return "AI Thinking";

    case "SPEAKING":
      return "AI Speaking";

    case "LISTENING":
      return "Listening";

    case "RINGING":
      return "Ringing";

    case "ANSWERED":
      return "Answered";

    default:
      break;
  }

  switch (
    callStatus
  ) {
    case "QUEUED":
      return "Queued";

    case "RINGING":
      return "Ringing";

    case "ANSWERED":
      return "Answered";

    default:
      return callStatus;
  }
}

export class DashboardService {
  static async getLiveDashboard(ownerUserId?: string) {
    const [
      activeCalls,
      queuedCalls,
      thinkingCallGroups,
      speakingCallGroups,
      completedToday,
      failedToday,
    ] =
      await Promise.all([
        DashboardRepository.activeCalls(ownerUserId),

        DashboardRepository.queuedCalls(ownerUserId),

        DashboardRepository.thinkingCalls(ownerUserId),

        DashboardRepository.speakingCalls(ownerUserId),

        DashboardRepository.completedToday(ownerUserId),

        DashboardRepository.failedToday(ownerUserId),
      ]);

    return {
      activeCalls,

      queuedCalls,

      thinkingCalls:
        thinkingCallGroups.length,

      speakingCalls:
        speakingCallGroups.length,

      completedCalls:
        completedToday,

      failedCalls:
        failedToday,
    };
  }

  static async getTimeline(ownerUserId?: string) {
    const events =
      await DashboardRepository.getTimeline(
        40,
        ownerUserId
      );

    return events.map(
      (
        event
      ) => ({
        id:
          event.id,

        callId:
          event.callId,

        event:
          event.message ??
          event.type,

        type:
          event.type,

        payload:
          event.payload,

        metadata:
          event.metadata,

        timestamp:
          event.createdAt.getTime(),

        createdAt:
          event.createdAt,

        call: {
          id:
            event.call.id,

          status:
            event.call.status,

          customerName:
            event.call.contact
              .fullName,

          phone:
            event.call.contact
              .phone,
        },
      })
    );
  }

  static async getActiveCalls(ownerUserId?: string) {
    const calls =
      await DashboardRepository.getActiveCalls(ownerUserId);

    return calls.map(
      (
        call
      ) => {
        const latestEvent =
          call.events[0];

        return {
          id:
            call.id,

          phone:
            call.providerDestination ??
            call.contactPhoneSnapshot ??
            call.contact.phone,

          status:
            getLiveStatus(
              call.status,
              latestEvent?.type
            ),

          startedAt:
            (
              call.startedAt ??
              call.answeredAt ??
              call.ringingAt ??
              call.queuedAt ??
              call.requestedAt ??
              call.createdAt
            ).getTime(),

          language:
            call.language,

          duration:
            call.duration ??
            undefined,

          customerName:
            call.contact.fullName,

          campaignName:
            call.campaign.name,

          providerCallId:
            call.providerCallId,
        };
      }
    );
  }
}
