import { prisma } from "@/lib/prisma";

export const UserRepository = {
  findAll() {
    return prisma.user.findMany({
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
  }>) {
    return prisma.user.update({
      where: {
        id,
      },
      data,
    });
  },

  delete(id: string) {
    return prisma.user.delete({
      where: {
        id,
      },
    });
  },
};