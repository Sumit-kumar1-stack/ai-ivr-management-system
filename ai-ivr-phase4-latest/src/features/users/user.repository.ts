import { prisma } from "@/lib/prisma";

export const UserRepository = {
  findAll() {
    return prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  findAllForTenant(tenantId: string) {
    return prisma.user.findMany({
      where: {
        tenantId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  },

  findByIdForTenant(
    id: string,
    tenantId: string
  ) {
    return prisma.user.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  },

  create(data: {
    fullName: string;
    email: string;
    password: string;
    role: "SUPER_ADMIN" | "ADMIN" | "AGENT";
    phone?: string;
    tenantId?: string | null;
    campaignCapabilities?: string[];
  }) {
    return prisma.user.create({
      data,
    });
  },

  update(id: string, data: Partial<{
    fullName: string;
    phone: string;
    avatar: string;
    isActive: boolean;
    lastLogin: Date;
    role: "SUPER_ADMIN" | "ADMIN" | "AGENT";
    campaignCapabilities: string[];
  }>) {
    return prisma.user.update({
      where: {
        id,
      },
      data,
    });
  },

  async updateForTenant(
    id: string,
    tenantId: string,
    data: Partial<{
      fullName: string;
      phone: string | null;
      avatar: string | null;
      isActive: boolean;
      role: "ADMIN" | "AGENT";
    }> & {
      campaignCapabilities?: string[];
    }
  ) {
    return prisma.$transaction(async tx => {
      const existing =
        await tx.user.findFirst({
          where: {
            id,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!existing) {
        return null;
      }

      return tx.user.update({
        where: {
          id,
        },

        data,
      });
    });
  },

  delete(id: string) {
    return prisma.user.delete({
      where: {
        id,
      },
    });
  },

  async deleteForTenant(
    id: string,
    tenantId: string
  ) {
    return prisma.$transaction(async tx => {
      const existing =
        await tx.user.findFirst({
          where: {
            id,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!existing) {
        return null;
      }

      return tx.user.delete({
        where: {
          id,
        },
      });
    });
  },
};
