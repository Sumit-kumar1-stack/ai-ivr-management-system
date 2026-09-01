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

  previousNodeId?:
    string | null;

  lastTrigger:
    string | null;

  lastValue:
    string | null;

  lastTriggeredAt?:
    number;

  navigationHistory?:
    string[];

  /** Runtime-neutral state collected before or during a conversation. */
  selectedIntent?: string | null;
  selectedDigit?: string | null;
  selectedDepartment?: string | null;
  inputExperience?: "VOICE" | "KEYPAD" | "STAGED_HYBRID" | null;
  preferredLanguage?: string | null;
  selectedRuntime?: "STANDARD" | "PREMIUM" | null;
  runtimeReasonCode?: string | null;
  runtimeReasonText?: string | null;
  collectedFields?: Record<string, string>;
  conversationMode?: "ENTRY_IVR" | "REALTIME_AI" | "TRANSFER" | "CALLBACK" | "ENDING";
  inputStage?: "ENTRY_IVR" | "REALTIME_AI" | "COMPLETE";
  fallbackNodeId?: string | null;
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

      previousNodeId:
        typeof parsed.previousNodeId ===
          "string" &&
        parsed.previousNodeId.trim()
          ? parsed.previousNodeId.trim()
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

      lastTriggeredAt:
        typeof parsed.lastTriggeredAt === "number" &&
        Number.isFinite(parsed.lastTriggeredAt)
          ? parsed.lastTriggeredAt
          : undefined,

      navigationHistory:
        Array.isArray(
          parsed.navigationHistory
        )
          ? parsed.navigationHistory
              .filter(
                value =>
                  typeof value ===
                    "string" &&
                  value.trim()
              )
              .map(
                value =>
                  value.trim()
              )
              .slice(
                -10
              )
          : [],
      selectedIntent: stringValue(parsed.selectedIntent),
      selectedDigit: stringValue(parsed.selectedDigit),
      selectedDepartment: stringValue(parsed.selectedDepartment),
      inputExperience: inputExperience(parsed.inputExperience),
      preferredLanguage: stringValue(parsed.preferredLanguage),
      selectedRuntime: selectedRuntime(parsed.selectedRuntime),
      runtimeReasonCode: stringValue(parsed.runtimeReasonCode),
      runtimeReasonText: stringValue(parsed.runtimeReasonText),
      collectedFields: recordOfStrings(parsed.collectedFields),
      conversationMode: conversationMode(parsed.conversationMode),
      inputStage: inputStage(parsed.inputStage),
      fallbackNodeId: stringValue(parsed.fallbackNodeId),
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

          previousNodeId:
            state.previousNodeId
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

          lastTriggeredAt:
            typeof state.lastTriggeredAt === "number" &&
            Number.isFinite(state.lastTriggeredAt)
              ? state.lastTriggeredAt
              : undefined,

          navigationHistory:
            Array.isArray(
              state.navigationHistory
            )
              ? state.navigationHistory
                  .filter(
                    value =>
                      typeof value ===
                        "string" &&
                      value.trim()
                  )
                  .map(
                    value =>
                      value.trim()
                  )
                  .slice(
                    -10
                  )
              : [],
          selectedIntent: stringValue(state.selectedIntent),
          selectedDigit: stringValue(state.selectedDigit),
          selectedDepartment: stringValue(state.selectedDepartment),
          inputExperience: inputExperience(state.inputExperience),
          preferredLanguage: stringValue(state.preferredLanguage),
          selectedRuntime: selectedRuntime(state.selectedRuntime),
          runtimeReasonCode: stringValue(state.runtimeReasonCode),
          runtimeReasonText: stringValue(state.runtimeReasonText),
          collectedFields: recordOfStrings(state.collectedFields),
          conversationMode: conversationMode(state.conversationMode),
          inputStage: inputStage(state.inputStage),
          fallbackNodeId: stringValue(state.fallbackNodeId),
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
    typeof item === "string" && item.trim() ? [[key, item.trim()]] : []
  ));
}

function conversationMode(value: unknown): IVRFlowSessionState["conversationMode"] {
  return value === "ENTRY_IVR" || value === "REALTIME_AI" || value === "TRANSFER" || value === "CALLBACK" || value === "ENDING" ? value : undefined;
}

function inputExperience(value: unknown): IVRFlowSessionState["inputExperience"] {
  return value === "VOICE" || value === "KEYPAD" || value === "STAGED_HYBRID" ? value : null;
}

function inputStage(value: unknown): IVRFlowSessionState["inputStage"] {
  return value === "ENTRY_IVR" || value === "REALTIME_AI" || value === "COMPLETE" ? value : undefined;
}

function selectedRuntime(value: unknown): IVRFlowSessionState["selectedRuntime"] {
  return value === "STANDARD" || value === "PREMIUM" ? value : null;
}
