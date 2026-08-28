import {
  prisma,
} from "@/lib/prisma";

export const ConversationRepository = {
  //------------------------------------------------
  // Create conversation
  //------------------------------------------------

  create(
    callId: string
  ) {
    return prisma.conversation.create({
      data: {
        callId,
      },
    });
  },

  //------------------------------------------------
  // Get conversation for live AI context
  //
  // Only the latest 10 messages are required
  // during an active conversation.
  //------------------------------------------------

  findByCall(
    callId: string
  ) {
    return prisma.conversation.findUnique({
      where: {
        callId,
      },

      include: {
        messages: {
          orderBy: {
            createdAt:
              "asc",
          },

          take:
            -10,
        },
      },
    });
  },

  //------------------------------------------------
  // Get complete conversation for post-call work
  //------------------------------------------------

  findCompleteByCall(
    callId: string
  ) {
    return prisma.conversation.findUnique({
      where: {
        callId,
      },

      include: {
        messages: {
          orderBy: {
            createdAt:
              "asc",
          },
        },
      },
    });
  },

  //------------------------------------------------
  // Add conversation message
  //------------------------------------------------

  addMessage(
    data: {
      conversationId: string;

      role:
        | "SYSTEM"
        | "USER"
        | "ASSISTANT";

      content: string;
    }
  ) {
    return prisma.conversationMessage.create({
      data,
    });
  },

  //------------------------------------------------
  // Update summary only
  //------------------------------------------------

  updateSummary(
    id: string,
    summary: string
  ) {
    return prisma.conversation.update({
      where: {
        id,
      },

      data: {
        summary,
      },
    });
  },

  //------------------------------------------------
  // Update complete analysis
  //------------------------------------------------

  updateAnalysis(
    conversationId: string,
    analysis: {
      summary: string;

      intent: string;

      sentiment: string;

      priority: string;

      followUp: boolean;

      actionItems: string[];
    }
  ) {
    return prisma.conversation.update({
      where: {
        id:
          conversationId,
      },

      data: {
        summary:
          analysis.summary,

        intent:
          analysis.intent,

        sentiment:
          analysis.sentiment,

        priority:
          analysis.priority,

        followUp:
          analysis.followUp,

        actionItems:
          analysis.actionItems,
      },
    });
  },
};