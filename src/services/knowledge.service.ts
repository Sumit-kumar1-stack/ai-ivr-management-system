import { prisma } from "@/lib/prisma";

export async function saveKnowledgeDocument(data: {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}) {
  return prisma.knowledgeDocument.create({
    data,
  });
}