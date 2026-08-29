import { loadEnvConfig } from "@next/env";

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
  // Load local Next.js environment configuration
  loadEnvConfig(process.cwd());

  const options = parseReconcileCommandOptions(process.argv.slice(2));

  // Dynamically import dependencies to avoid triggering side effects early
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
    // Ensure all network/DB connections are safely closed
    await queue.close();
    await prismaModule.closePrismaConnection();
    await redisModule.closeRedisConnection();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exitCode = 1;
});
