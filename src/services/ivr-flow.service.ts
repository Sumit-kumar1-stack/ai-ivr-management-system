import { prisma } from "@/lib/prisma";

export class IVRFlowService {
  static async create(data: {
    name: string;
    description?: string;
    campaignId?: string;
    nodes: any[];
    edges: any[];
  }) {
    return prisma.iVRFlow.create({
      data,
    });
  }

  static async findAll() {
    return prisma.iVRFlow.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  static async findById(id: string) {
    return prisma.iVRFlow.findUnique({
      where: {
        id,
      },
    });
  }

  static async update(
    id: string,
    data: {
      nodes: any[];
      edges: any[];
    }
  ) {
    return prisma.iVRFlow.update({
      where: {
        id,
      },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.iVRFlow.delete({
      where: {
        id,
      },
    });
  }
}