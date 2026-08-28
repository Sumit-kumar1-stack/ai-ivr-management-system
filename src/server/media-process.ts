import { bootstrapMediaProcess } from "./media-bootstrap";

void bootstrapMediaProcess().catch(error => {
  // This entrypoint cannot import the structured logger before the environment
  // bootstrap completes. Keep the message non-sensitive.
  console.error("MEDIA process startup failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
