import {
  closeCampaignWorker,
  initializeCampaignWorker,
} from "./campaign.worker";

import {
  closeCallRetryWorker,
  initializeCallRetryWorker,
} from "./call-retry.worker";

import {
  closeStaleCallCleanup,
  initializeStaleCallCleanup,
} from "@/services/calls/stale-call-cleanup.service";

import {
  CallRetryQueueService,
} from "@/services/calls/call-retry-queue.service";

import {
  CampaignQueueService,
} from "@/services/campaigns/campaign-queue.service";

import {
  createWorkerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createWorkerLogger(
    "worker-manager"
  );

//--------------------------------------------------
// Worker State
//--------------------------------------------------

let workersInitialized =
  false;

let workersClosing:
  Promise<void> |
  null =
    null;

//--------------------------------------------------
// Initialize All Workers
//--------------------------------------------------

export function initializeWorkers():
  void {
  if (
    workersInitialized
  ) {
    log.debug(
      {
        event:
          "workers.initialize.skipped",

        reason:
          "already_initialized",
      },
      "Background workers are already initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "workers.initialize.started",
    },
    "Background worker initialization started"
  );

  try {
    //----------------------------------------
    // Campaign Processing Worker
    //----------------------------------------

    initializeCampaignWorker();

    //----------------------------------------
    // Delayed Call Retry Worker
    //----------------------------------------

    initializeCallRetryWorker();

    //----------------------------------------
    // Stale Call Cleanup Timer
    //----------------------------------------

    initializeStaleCallCleanup();

    workersInitialized =
      true;

    log.info(
      {
        event:
          "workers.initialize.completed",

        campaignWorker:
          true,

        callRetryWorker:
          true,

        staleCallCleanup:
          true,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Background workers initialized"
    );
  } catch (
    error
  ) {
    workersInitialized =
      false;

    log.error(
      {
        event:
          "workers.initialize.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Background worker initialization failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Close All Workers And Queues
//--------------------------------------------------

export function closeWorkers():
  Promise<void> {
  if (
    workersClosing
  ) {
    log.debug(
      {
        event:
          "workers.close.joined",
      },
      "Worker shutdown is already in progress"
    );

    return workersClosing;
  }

  workersClosing =
    closeWorkersInternal()
      .finally(
        () => {
          workersClosing =
            null;
        }
      );

  return workersClosing;
}

//--------------------------------------------------
// Internal Worker Shutdown
//--------------------------------------------------

async function closeWorkersInternal():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "workers.close.started",

      wereInitialized:
        workersInitialized,
    },
    "Background resource shutdown started"
  );

  /*
   * Change the state immediately so the readiness
   * endpoint no longer reports workers as ready.
   */
  workersInitialized =
    false;

  const errors:
    Array<{
      resource: string;

      error: ReturnType<
        typeof normalizeError
      >;
    }> = [];

  //----------------------------------------
  // Stop Scheduled Cleanup
  //----------------------------------------

  try {
    closeStaleCallCleanup();

    log.info(
      {
        event:
          "workers.stale_cleanup.closed",
      },
      "Stale call cleanup stopped"
    );
  } catch (
    error
  ) {
    errors.push({
      resource:
        "stale-call-cleanup",

      error:
        normalizeError(
          error
        ),
    });
  }

  //----------------------------------------
  // Close Campaign Worker
  //----------------------------------------

  try {
    await closeCampaignWorker();

    log.info(
      {
        event:
          "workers.campaign_worker.closed",
      },
      "Campaign worker closed"
    );
  } catch (
    error
  ) {
    errors.push({
      resource:
        "campaign-worker",

      error:
        normalizeError(
          error
        ),
    });
  }

  //----------------------------------------
  // Close Retry Worker
  //----------------------------------------

  try {
    await closeCallRetryWorker();

    log.info(
      {
        event:
          "workers.call_retry_worker.closed",
      },
      "Call retry worker closed"
    );
  } catch (
    error
  ) {
    errors.push({
      resource:
        "call-retry-worker",

      error:
        normalizeError(
          error
        ),
    });
  }

  //----------------------------------------
  // Close Campaign Queue
  //----------------------------------------

  try {
    await CampaignQueueService.close();

    log.info(
      {
        event:
          "workers.campaign_queue.closed",
      },
      "Campaign queue closed"
    );
  } catch (
    error
  ) {
    errors.push({
      resource:
        "campaign-queue",

      error:
        normalizeError(
          error
        ),
    });
  }

  //----------------------------------------
  // Close Retry Queue
  //----------------------------------------

  try {
    await CallRetryQueueService.close();

    log.info(
      {
        event:
          "workers.call_retry_queue.closed",
      },
      "Call retry queue closed"
    );
  } catch (
    error
  ) {
    errors.push({
      resource:
        "call-retry-queue",

      error:
        normalizeError(
          error
        ),
    });
  }

  //----------------------------------------
  // Report Shutdown Result
  //----------------------------------------

  if (
    errors.length >
    0
  ) {
    log.error(
      {
        event:
          "workers.close.partial_failure",

        failedResources:
          errors.map(
            item =>
              item.resource
          ),

        errors,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "One or more background resources failed to close"
    );

    throw new Error(
      `Failed to close ${errors.length} background resource(s): ${errors
        .map(
          item =>
            item.resource
        )
        .join(", ")}`
    );
  }

  log.info(
    {
      event:
        "workers.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Background workers and queues closed"
  );
}

//--------------------------------------------------
// Worker Readiness
//--------------------------------------------------

export function areWorkersInitialized():
  boolean {
  return (
    workersInitialized &&
    workersClosing ===
      null
  );
}