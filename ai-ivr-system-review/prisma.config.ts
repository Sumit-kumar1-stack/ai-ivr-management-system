import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({
  path: ".env.local",
  override: true,
});

loadEnv({
  path: ".env",
});

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
