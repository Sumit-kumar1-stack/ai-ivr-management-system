import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({
    where: {
      email: "admin@ivr.com",
    },
  });

  if (admin) {
    console.log("Admin already exists.");
    return;
  }

  const password = await bcrypt.hash("Admin@123", 10);

  await prisma.user.create({
    data: {
      fullName: "Super Admin",
      email: "admin@ivr.com",
      password,
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log("Super Admin created.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });