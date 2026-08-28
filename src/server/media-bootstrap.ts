import { loadEnvConfig } from "@next/env";
import { validateEnvironmentFor } from "@/config/process-environment";

type MediaServerModule = {
  startMediaProcess: () => Promise<void>;
};

/**
 * Keep this module dependency-free apart from environment loading and its
 * validator. The real media server has runtime imports that may initialize AI
 * clients, so it must only be loaded after this function completes validation.
 */
export async function bootstrapMediaProcess(
  loadEnvironment: (projectRoot: string) => unknown = loadEnvConfig,
  validateEnvironment: (service: "media") => void = validateEnvironmentFor,
  importMediaServer: () => Promise<MediaServerModule> = () => import("./twilio-media-server")
): Promise<void> {
  loadEnvironment(process.cwd());
  validateEnvironment("media");
  const { startMediaProcess } = await importMediaServer();
  await startMediaProcess();
}
