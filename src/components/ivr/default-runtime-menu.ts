import type { IVRRuntimeMenuConfig } from "./types";

/** Generic draft defaults only. Tenant/business language belongs in the flow. */
export function createDefaultRuntimeMenu(): IVRRuntimeMenuConfig {
  return {
    type: "DTMF_MENU",
    inputMode: "BOTH",
    prompt: "Please press or say one of the available options.",
    repeatPrompt: "Here are the options again.",
    invalidPrompt: "I didn't recognize that option. Please try again.",
    timeoutPrompt: "I didn't receive a response. Please try again.",
    exhaustedPrompt: "Maximum attempts reached. Ending the call.",
    maxAttempts: 3,
    timeoutSeconds: 8,
    options: [],
  };
}
