import {
  loadEnvConfig,
} from "@next/env";

/**
 * Load .env, .env.local and other
 * Next.js environment files before
 * importing the application.
 */
loadEnvConfig(
  process.cwd()
);

async function bootstrap() {
  await import(
    "./server"
  );
}

bootstrap().catch(
  (error) => {
    console.error(
      "Server bootstrap failed:",
      error
    );

    process.exit(1);
  }
);