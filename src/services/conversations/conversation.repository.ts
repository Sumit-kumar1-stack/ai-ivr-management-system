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
};