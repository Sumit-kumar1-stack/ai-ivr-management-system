import { existsSync } from "node:fs";
import path from "node:path";

const required = ["BUILD_ID", "server", "build-manifest.json"];
const missing = required.filter(entry => !existsSync(path.join(process.cwd(), ".next", entry)));
if (missing.length) {
  console.error(`Build verification failed: missing .next/${missing.join(", .next/")}`);
  process.exitCode = 1;
} else {
  console.log("Build verification passed.");
}
