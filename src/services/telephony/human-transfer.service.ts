import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getHumanTransferAdapter,
} from "./human-transfer-registry.service";

import {
  markHumanTransferAccepted,
  markHumanTransferFailed,
  markHumanTransferRequested,
} from "./human-transfer-lifecycle.service";

import type {
  HumanTransferRequest,
  HumanTransferResult,
} from "./human-transfer.types";

import {
  registerHumanTransferAdapters,
} from "./register-human-transfer-adapters.service";

//--------------------------------------------------
// Transfer
//--------------------------------------------------

export async function transferHumanCall(
  request:
    HumanTransferRequest
): Promise<HumanTransferResult> {
  const log =
    createCallLogger(
      request.callId
    );

  //------------------------------------------------
  // Ensure Provider Adapters Are Registered
  //------------------------------------------------

  registerHumanTransferAdapters();

  //------------------------------------------------
  // Validate
  //------------------------------------------------

  const destination =
    request.destination.trim();

  const providerCallId =
    request.providerCallId.trim();

  if (
    !providerCallId
  ) {
    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId:
        "",

      code:
        "PROVIDER_CALL_ID_REQUIRED",

      message:
        "Provider call ID is required for transfer.",
    };
  }

  if (
    !destination
  ) {
    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId,

      code:
        "TRANSFER_DESTINATION_REQUIRED",

      message:
        "Human transfer destination is required.",
    };
  }

  //------------------------------------------------
  // Abort Guard
  //------------------------------------------------

  if (
    request.signal?.aborted
  ) {
    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId,

      code:
        "TRANSFER_ABORTED",

      message:
        "Human transfer was cancelled.",
    };
  }

  //------------------------------------------------
  // Resolve Provider Adapter
  //------------------------------------------------

  const adapter =
    getHumanTransferAdapter(
      request.provider
    );

  if (
    !adapter
  ) {
    log.warn(
      {
        event:
          "human_transfer.adapter_missing",

        provider:
          request.provider,
      },
      "Human transfer adapter is not registered"
    );

    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId,

      code:
        "TRANSFER_NOT_SUPPORTED",

      message:
        "Human transfer is not configured for this telephony provider.",
    };
  }

  if (
    !adapter.isConfigured()
  ) {
    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId,

      code:
        "TRANSFER_PROVIDER_NOT_CONFIGURED",

      message:
        "Human transfer provider configuration is incomplete.",
    };
  }

  //------------------------------------------------
  // Mark REQUESTED Before Provider Operation
  //------------------------------------------------

  await markHumanTransferRequested(
    request.callId
  );

  //------------------------------------------------
  // Execute Provider Transfer
  //------------------------------------------------

  try {
    log.info(
      {
        event:
          "human_transfer.started",

        provider:
          request.provider,

        strategy:
          request.strategy,

        reasonPresent:
          Boolean(
            request.reason
          ),
      },
      "Human transfer started"
    );

    const result =
      await adapter.transfer({
        ...request,

        providerCallId,

        destination,
      });

    //------------------------------------------------
    // Provider Rejected Transfer
    //------------------------------------------------

    if (
      !result.success
    ) {
      await markHumanTransferFailed(
        request.callId,
        {
          failureCode:
            result.code,

          failureMessage:
            result.message,
        }
      );

      log.warn(
        {
          event:
            "human_transfer.rejected",

          provider:
            result.provider,

          code:
            result.code,
        },
        "Human transfer was rejected by provider"
      );

      return result;
    }

    //------------------------------------------------
    // Provider Accepted Transfer Command
    //------------------------------------------------

    await markHumanTransferAccepted(
      request.callId,
      {
        provider:
          result.provider,

        destination,
      }
    );

    log.info(
      {
        event:
          "human_transfer.provider_accepted",

        provider:
          result.provider,

        transferReference:
          result.transferReference,
      },
      "Human transfer request accepted by provider"
    );

    /*
     * IMPORTANT:
     *
     * Do not mark ANSWERED or COMPLETED here.
     *
     * adapter.transfer() only proves that the provider
     * accepted the transfer operation.
     *
     * DIALING / ANSWERED / FAILED / COMPLETED must be
     * driven by provider transfer-leg callbacks.
     */

    return result;
  } catch (
    error
  ) {
    const normalizedError =
      normalizeError(
        error
      );

    await markHumanTransferFailed(
      request.callId,
      {
        failureCode:
          "TRANSFER_PROVIDER_ERROR",

        failureMessage:
          normalizedError.message,
      }
    );

    log.error(
      {
        event:
          "human_transfer.failed",

        provider:
          request.provider,

        error:
          normalizedError,
      },
      "Human transfer failed"
    );

    return {
      success:
        false,

      provider:
        request.provider,

      providerCallId,

      code:
        "TRANSFER_PROVIDER_ERROR",

      message:
        "The telephony provider could not complete the human transfer.",
    };
  }
}