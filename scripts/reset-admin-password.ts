import {
  PrismaClient,
  UserRole,
} from "@prisma/client";

import bcrypt from "bcrypt";
import { readAdminPasswordResetInput } from "../src/lib/admin-password-reset-guard";

const prisma =
  new PrismaClient();

async function main():
  Promise<void> {

  const { email, password: newPassword, fullName } = readAdminPasswordResetInput();

  const hashedPassword =
    await bcrypt.hash(
      newPassword,
      10
    );

  const existingUser =
    await prisma.user.findUnique({
      where: {
        email,
      },

      select: {
        id:
          true,

        email:
          true,

        role:
          true,
      },
    });

  if (
    existingUser
  ) {

    const updatedUser =
      await prisma.user.update({
        where: {
          email,
        },

        data: {
          password:
            hashedPassword,

          role:
            UserRole.ADMIN,

          isActive:
            true,
        },

        select: {
          id:
            true,

          fullName:
            true,

          email:
            true,

          role:
            true,

          isActive:
            true,
        },
      });

    console.log(
      "Admin password reset successfully for user:",
      updatedUser.id
    );

    return;
  }

  const createdUser =
    await prisma.user.create({
      data: {
        fullName,

        email,

        password:
          hashedPassword,

        role:
          UserRole.ADMIN,

        isActive:
          true,
      },

      select: {
        id:
          true,

        fullName:
          true,

        email:
          true,

        role:
          true,

        isActive:
          true,
      },
    });

  console.log(
    "Admin user created successfully:",
    createdUser.id
  );
}

main()
  .catch(
    (
      error:
        unknown
    ) => {

      console.error("Failed to create or reset admin.");

      process.exit(
        1
      );
    }
  )
  .finally(
    async () => {

      await prisma.$disconnect();

    }
  );
