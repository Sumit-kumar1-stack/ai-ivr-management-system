import {
  CallStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  ProviderFactory,
} from "@/providers/telephony/provider.factory";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface EndProviderCallResult {
  success:
    boolean;

  alreadyEnded:
    boolean;

  providerCallId:
    string | null;

  message:
    string;

  code:
    string | null;
}

//--------------------------------------------------
// End Call
//--------------------------------------------------

export async function endProviderCall(
  internalCallId:
    string
): Promise<EndProviderCallResult> {
  const log =
    createCallLogger(
      internalCallId
    );

  try {
    //------------------------------------------------
    // Load Call
    //------------------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            internalCallId,
        },

        select: {
          id:
            true,

          providerCallId:
            true,

          provider:
            true,

          status:
            true,
        },
      });

    if (
      !call
    ) {
      return {
        success:
          false,

        alreadyEnded:
          false,

        providerCallId:
          null,

        code:
          "CALL_NOT_FOUND",

        message:
          "Call could not be found.",
      };
    }

    //------------------------------------------------
    // Already Terminal
    //------------------------------------------------

    if (
      isTerminalCallStatus(
        call.status
      )
    ) {
      return {
        success:
          true,

        alreadyEnded:
          true,

        providerCallId:
          call.providerCallId,

        code:
          null,

        message:
          "Call is already in a terminal state.",
      };
    }

    //------------------------------------------------
    // Provider ID
    //------------------------------------------------

    const providerCallId =
      call.providerCallId
        ?.trim();

    if (
      !providerCallId
    ) {
      return {
        success:
          false,

        alreadyEnded:
          false,

        providerCallId:
          null,

        code:
          "PROVIDER_CALL_ID_MISSING",

        message:
          "Provider call identifier is not available.",
      };
    }

    //------------------------------------------------
    // Provider
    //------------------------------------------------

    const provider =
      ProviderFactory
        .getProviderForName(
          call.provider
        );

    //------------------------------------------------
    // Execute Provider Hangup
    //------------------------------------------------

    await provider.endCall(
      providerCallId
    );

    //------------------------------------------------
    // Local State
    //------------------------------------------------

    /*
     * Provider webhook remains authoritative for
     * final duration/timestamps.
     *
     * We only mark the call completed if it has not
     * already transitioned asynchronously.
     */

    await prisma.call.updateMany({
      where: {
        id:
          internalCallId,

        status: {
          notIn: [
            CallStatus.COMPLETED,
            CallStatus.FAILED,
            CallStatus.BUSY,
            CallStatus.NO_ANSWER,
            CallStatus.CANCELED,
          ],
        },
      },

      data: {
        status:
          CallStatus.COMPLETED,

        completedAt:
          new Date(),

        endedAt:
          new Date(),
      },
    });

    log.info(
      {
        event:
          "telephony.end_call.completed",

        providerCallId,
      },
      "Provider call end request completed"
    );

    return {
      success:
        true,

      alreadyEnded:
        false,

      providerCallId,

      code:
        null,

      message:
        "Call end request was accepted.",
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "telephony.end_call.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Provider call end request failed"
    );

    return {
      success:
        false,

      alreadyEnded:
        false,

      providerCallId:
        null,

      code:
        "END_CALL_FAILED",

      message:
        "The call could not be ended.",
    };
  }
}

//--------------------------------------------------
// Terminal Status
//--------------------------------------------------

function isTerminalCallStatus(
  status:
    CallStatus
): boolean {
  switch (
    status
  ) {
    case CallStatus.COMPLETED:
    case CallStatus.FAILED:
    case CallStatus.BUSY:
    case CallStatus.NO_ANSWER:
    case CallStatus.CANCELED:
      return true;

    default:
      return false;
  }
}
