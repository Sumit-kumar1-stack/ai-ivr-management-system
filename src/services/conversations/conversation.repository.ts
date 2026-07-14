import { prisma } from "@/lib/prisma";

export const ConversationRepository = {
  create(callId: string) {
    return prisma.conversation.create({
      data: {
        callId,
      },
    });
  },

  findByCall(callId: string) {
    return prisma.conversation.findUnique({
      where: {
        callId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
          take: -10,
        },
      },
    });
  },

  addMessage(data: {
    conversationId: string;
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
  }) {
    return prisma.conversationMessage.create({
      data,
    });
  },

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
        id: conversationId,
      },
      data: {
        summary: analysis.summary,
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        priority: analysis.priority,
        followUp: analysis.followUp,
        actionItems: analysis.actionItems,
      },
    });
  },
};