import {
  loadEnvConfig,
} from "@next/env";

import {
  RECOVERY_JOB_STATES,
  recoverFailedCommunicationCampaignJob,
} from "./lib/retry-failed-communication-campaign-job";

interface CommandOptions {
  queueName: string;
  jobId: string;
  campaignId: string;
  execute: boolean;
  confirmed: boolean;
}

function readFlagValue(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1]?.trim() : undefined;

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires an explicit value`);
  }

  return value;
}

export function parseRecoveryCommandOptions(args: string[]): CommandOptions {
  const execute = args.includes("--execute");

  if (execute && args.includes("--dry-run")) {
    throw new Error("--dry-run and --execute cannot be used together");
  }

  return {
    queueName: readFlagValue(args, "--queue"),
    jobId: readFlagValue(args, "--job"),
    campaignId: readFlagValue(args, "--campaign"),
    execute,
    confirmed: args.includes("--confirm-f3-retry"),
  };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const options = parseRecoveryCommandOptions(process.argv.slice(2));
  const [bullmq, queueModule, redisModule, prismaModule] = await Promise.all([
    import("bullmq"),
    import("../src/services/communication/communication-campaign-queue.service"),
    import("../src/lib/redis"),
    import("../src/lib/prisma"),
  ]);

  const queue = new bullmq.Queue(queueModule.COMMUNICATION_QUEUE_NAME, {
    connection: redisModule.redisConnection,
  });

  try {
    const result = await recoverFailedCommunicationCampaignJob(
      {
        ...options,
        expectedQueueName: queueModule.COMMUNICATION_QUEUE_NAME,
        expectedJobName: queueModule.COMMUNICATION_JOB_NAME,
      },
      {
        queue: {
          getJob: jobId => queue.getJob(jobId),
          listJobs: () => queue.getJobs([...RECOVERY_JOB_STATES]),
        },
        loadCampaign: campaignId =>
          prismaModule.prisma.communicationCampaign.findUnique({
            where: { id: campaignId },
            select: {
              id: true,
              status: true,
              approvalStatus: true,
              outboundAttempts: {
                select: {
                  id: true,
                  providerRequestId: true,
                  providerCallId: true,
                  call: {
                    select: {
                      id: true,
                      providerCallId: true,
                    },
                  },
                },
              },
              calls: {
                select: {
                  id: true,
                  providerCallId: true,
                },
              },
            },
          }),
        report: lines => {
          console.log("Communication campaign failed-job recovery preflight");
          for (const line of lines) console.log(line);
        },
      }
    );

    console.log(
      result.mode === "DRY_RUN"
        ? "Dry run complete. No queue mutation was performed."
        : `Retry complete. Job ${result.jobId} is now ${result.stateAfter}.`
    );
  } finally {
    await queue.close();
    await prismaModule.closePrismaConnection();
    await redisModule.closeRedisConnection();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
