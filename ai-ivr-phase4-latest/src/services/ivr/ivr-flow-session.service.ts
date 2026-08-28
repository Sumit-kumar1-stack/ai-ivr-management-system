import {
  redisConnection,
} from "@/lib/redis";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const SESSION_TTL_SECONDS =
  60 * 60;

const KEY_PREFIX =
  "ivr:flow-session";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface IVRFlowSessionState {
  flowId:
    string;

  currentNodeId:
    string | null;

  lastTrigger:
    string | null;

  lastValue:
    string | null;
}

//--------------------------------------------------
// Key
//--------------------------------------------------

function buildKey(
  callId: string
): string {
  return `${KEY_PREFIX}:${callId}`;
}

//--------------------------------------------------
// Parse
//--------------------------------------------------

function parseState(
  raw: string | null
): IVRFlowSessionState | null {
  if (
    !raw
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        raw
      ) as Partial<IVRFlowSessionState>;

    const flowId =
      typeof parsed.flowId ===
        "string" &&
      parsed.flowId.trim()
        ? parsed.flowId.trim()
        : "";

    if (
      !flowId
    ) {
      return null;
    }

    return {
      flowId,

      currentNodeId:
        typeof parsed.currentNodeId ===
          "string" &&
        parsed.currentNodeId.trim()
          ? parsed.currentNodeId.trim()
          : null,

      lastTrigger:
        typeof parsed.lastTrigger ===
          "string" &&
        parsed.lastTrigger.trim()
          ? parsed.lastTrigger.trim()
          : null,

      lastValue:
        typeof parsed.lastValue ===
          "string" &&
        parsed.lastValue.trim()
          ? parsed.lastValue.trim()
          : null,
    };
  } catch {
    return null;
  }
}

//--------------------------------------------------
// Service
//--------------------------------------------------

export const IVRFlowSessionService = {
  async get(
    callId: string
  ): Promise<IVRFlowSessionState | null> {
    const normalized =
      callId.trim();

    if (
      !normalized
    ) {
      return null;
    }

    return parseState(
      await redisConnection.get(
        buildKey(
          normalized
        )
      )
    );
  },

  async set(
    callId: string,
    state: IVRFlowSessionState
  ): Promise<void> {
    const normalized =
      callId.trim();

    if (
      !normalized ||
      !state.flowId.trim()
    ) {
      return;
    }

    await redisConnection.set(
      buildKey(
        normalized
      ),
      JSON.stringify(
        {
          flowId:
            state.flowId.trim(),

          currentNodeId:
            state.currentNodeId
              ?.trim() ||
            null,

          lastTrigger:
            state.lastTrigger
              ?.trim() ||
            null,

          lastValue:
            state.lastValue
              ?.trim() ||
            null,
        }
      ),
      "EX",
      SESSION_TTL_SECONDS
    );
  },

  async reset(
    callId: string
  ): Promise<void> {
    const normalized =
      callId.trim();

    if (
      !normalized
    ) {
      return;
    }

    await redisConnection.del(
      buildKey(
        normalized
      )
    );
  },
};
