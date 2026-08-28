export type LocalIntentType =
  | "GREETING"
  | "STOP"
  | "WAIT"
  | "REPEAT"
  | "CONFIRM_YES"
  | "CONFIRM_NO"
  | "END_CALL"
  | "HUMAN_AGENT"
  | "NONE";

export interface LocalIntentResult {
  type: LocalIntentType;

  handled: boolean;

  reply?: string;
}

//--------------------------------------------------
// Normalize
//--------------------------------------------------

function normalizeIntentText(
  text: string
): string {
  return text
    .toLowerCase()
    .trim()
    .replace(
      /[.,!?;:'"]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
}

//--------------------------------------------------
// Exact / Short Phrase Matching
//--------------------------------------------------

function matchesAny(
  text: string,
  phrases: readonly string[]
): boolean {
  return phrases.includes(
    text
  );
}

//--------------------------------------------------
// Local Intent Router
//--------------------------------------------------

export function routeLocalIntent(
  message: string
): LocalIntentResult {
  const text =
    normalizeIntentText(
      message
    );

  if (
    !text
  ) {
    return {
      type: "NONE",
      handled: false,
    };
  }

  //----------------------------------------------
  // Greeting
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "hi",
        "hello",
        "hey",
        "hello there",
        "good morning",
        "good afternoon",
        "good evening",
        "namaste",
        "namaskar",
      ]
    )
  ) {
    return {
      type: "GREETING",
      handled: true,

      reply:
        "Hello. How may I help you?",
    };
  }

  //----------------------------------------------
  // Stop
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "stop",
        "stop please",
        "please stop",
        "cancel",
        "enough",
      ]
    )
  ) {
    return {
      type: "STOP",
      handled: true,

      reply:
        "Okay. I'm listening.",
    };
  }

  //----------------------------------------------
  // Wait
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "wait",
        "wait please",
        "please wait",
        "hold on",
        "one moment",
        "just a moment",
      ]
    )
  ) {
    return {
      type: "WAIT",
      handled: true,

      reply:
        "Sure.",
    };
  }

  //----------------------------------------------
  // Repeat
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "repeat",
        "repeat that",
        "say that again",
        "say again",
        "can you repeat",
      ]
    )
  ) {
    /*
     * We classify this now, but actual replay of the
     * previous assistant response will be wired in the
     * next context phase.
     */
    return {
      type: "REPEAT",
      handled: true,

      reply:
        "Sure. Please tell me what you would like me to repeat.",
    };
  }

  //----------------------------------------------
  // Confirmation
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "yes",
        "yeah",
        "yep",
        "correct",
        "okay yes",
      ]
    )
  ) {
    return {
      type: "CONFIRM_YES",
      handled: true,

      reply:
        "Okay.",
    };
  }

  if (
    matchesAny(
      text,
      [
        "no",
        "nope",
        "not really",
        "no thanks",
        "no thank you",
      ]
    )
  ) {
    return {
      type: "CONFIRM_NO",
      handled: true,

      reply:
        "Okay.",
    };
  }

  //----------------------------------------------
  // Human Agent
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "agent",
        "human agent",
        "representative",
        "customer care",
        "talk to agent",
        "talk to a person",
        "speak to agent",
        "speak to a person",
      ]
    )
  ) {
    return {
      type: "HUMAN_AGENT",
      handled: true,

      /*
       * We deliberately do not perform the transfer yet.
       * Provider-independent transfer belongs in the
       * Tool Gateway / TelephonyProvider phase.
       */
      reply:
        "I can arrange assistance from a representative.",
    };
  }

  //----------------------------------------------
  // End Call
  //----------------------------------------------

  if (
    matchesAny(
      text,
      [
        "bye",
        "goodbye",
        "thank you bye",
        "thanks bye",
        "end call",
      ]
    )
  ) {
    return {
      type: "END_CALL",
      handled: true,

      /*
       * Actual provider-independent hangup will be
       * connected through the Tool Gateway later.
       */
      reply:
        "Thank you for calling. Goodbye.",
    };
  }

  //----------------------------------------------
  // Everything Else
  //----------------------------------------------

  return {
    type: "NONE",
    handled: false,
  };
}