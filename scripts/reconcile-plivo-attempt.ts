// @next/env has no Redis dependency — safe to import statically.
import { loadEnvConfig } from "@next/env";

// ---------------------------------------------------------------------------
// Only pure, side-effect-free helpers are defined at module level.
// Redis, BullMQ, Prisma, and all application service modules are imported
// DYNAMICALLY inside main(), after loadEnvConfig() has populated process.env.
// ---------------------------------------------------------------------------

interface CommandOptions {
  campaignId: string;
  attemptId: string;
  callUuid: string;
  execute: boolean;
  confirmProviderReconciliation: boolean;
}

function readFlagValue(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1]?.trim() : undefined;

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires an explicit value`);
  }

  return value;
}

export function parseReconcileCommandOptions(args: string[]): CommandOptions {
  const execute = args.includes("--execute");
  const dryRun = args.includes("--dry-run");

  if (execute && dryRun) {
    throw new Error("--dry-run and --execute cannot be used together");
  }

  return {
    campaignId: readFlagValue(args, "--campaign"),
    attemptId: readFlagValue(args, "--attempt"),
    callUuid: readFlagValue(args, "--call-uuid"),
    execute,
    confirmProviderReconciliation: args.includes("--confirm-provider-reconciliation"),
  };
}

async function main(): Promise<void> {
  // Step 1 — load .env / .env.local BEFORE anything that reads process.env.
  loadEnvConfig(process.cwd());

  // Step 2 — parse CLI flags (pure, no env access).
  const options = parseReconcileCommandOptions(process.argv.slice(2));

  // Step 3 — dynamically import every module that transitively accesses Redis,
  //           BullMQ, or any env accessor.  These imports resolve only now,
  //           after the env variables are in process.env.
  const [
    reconcileModule,
    lifecycleModule,
    bullmq,
    prismaModule,
    queueModule,
    redisModule,
  ] = await Promise.all([
    import("./lib/reconcile-plivo-attempt"),
    import("../src/services/communication/communication-outbound-lifecycle.service"),
    import("bullmq"),
    import("../src/lib/prisma"),
    import("../src/services/communication/communication-campaign-queue.service"),
    import("../src/lib/redis"),
  ]);

  const queue = new bullmq.Queue(queueModule.COMMUNICATION_QUEUE_NAME, {
    connection: redisModule.redisConnection,
  });

  try {
    const result = await reconcileModule.reconcilePlivoAttempt(
      options,
      {
        prisma: prismaModule.prisma,
        queue,
        processOutboundLifecycle: lifecycleModule.processOutboundPlivoLifecycle,
        report: (lines) => {
          console.log("Plivo attempt reconciliation utility preflight:");
          for (const line of lines) {
            console.log(`  ${line}`);
          }
        },
      }
    );

    if (result.alreadyReconciled) {
      console.log(`No mutations made: Attempt ${result.attemptId} is already reconciled.`);
    } else if (result.mode === "DRY_RUN") {
      console.log("Dry run complete. No database or queue mutation was performed.");
    } else {
      console.log(`Reconciliation complete. Attempt ${result.attemptId} transitioned from ${result.statusBefore} to ${result.statusAfter}.`);
    }
  } finally {
    // Safely close all connections regardless of success or failure.
    await queue.close();
    await prismaModule.closePrismaConnection();
    await redisModule.closeRedisConnection();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exitCode = 1;
});
