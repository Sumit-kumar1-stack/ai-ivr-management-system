import { Logger } from "@/lib/logger";

export async function GET() {

  Logger.info("Logger initialized");

  Logger.debug({
    route: "/api/test-logger",
  });

  Logger.warn("Warning example");

  Logger.error({
    error: "Sample Error",
  });

  return Response.json({
    success: true,
  });

}