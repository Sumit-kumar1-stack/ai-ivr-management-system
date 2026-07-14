import { prisma } from "@/lib/prisma";

export async function getConversationMemory(
  callId: string
) {
  const conversation =
    await prisma.conversation.findUnique({
      where: {
        callId,
      },
      select: {
        summary: true,
      },
    });

  return conversation?.summary ?? "";
}

export async function updateConversationMemory(
  callId: string,
  summary: string
) {
  return prisma.conversation.update({
    where: {
      callId,
    },
    data: {
      summary,
    },
  });
}