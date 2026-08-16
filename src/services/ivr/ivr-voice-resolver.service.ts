import type {
  IVRAction,
  IVRMenuOption,
  IVRRuntimeMenu,
} from "./ivr-runtime.types";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface IVRVoiceResolution {
  matched: boolean;

  action:
    | IVRAction
    | null;

  option:
    | IVRMenuOption
    | null;

  confidence:
    number;

  reason:
    string;
}

//--------------------------------------------------
// Stop Words
//--------------------------------------------------

const STOP_WORDS =
  new Set<string>([
    "a",
    "an",
    "and",
    "are",
    "about",
    "can",
    "could",
    "for",
    "give",
    "i",
    "in",
    "information",
    "is",
    "me",
    "my",
    "of",
    "on",
    "please",
    "tell",
    "the",
    "to",
    "want",
    "what",
    "with",
    "would",
  ]);

//--------------------------------------------------
// Action Aliases
//--------------------------------------------------

const ACTION_ALIASES:
  Partial<
    Record<
      IVRAction,
      string[]
    >
  > = {
  LOAN_INFORMATION: [
    "loan",
    "loans",
    "personal loan",
    "home loan",
    "business loan",
    "loan eligibility",
    "loan interest",
    "loan rate",
    "emi",
  ],

  DEPOSIT_INFORMATION: [
    "deposit",
    "deposits",
    "fixed deposit",
    "fd",
    "recurring deposit",
    "rd",
    "savings deposit",
  ],

  BRANCH_INFORMATION: [
    "branch",
    "branches",
    "branch information",
    "branch location",
    "nearest branch",
    "bank branch",
  ],

  REQUEST_CALLBACK: [
    "callback",
    "call back",
    "call me back",
    "request callback",
    "contact me later",
  ],

  HUMAN_AGENT: [
    "human",
    "human agent",
    "agent",
    "representative",
    "customer care",
    "customer support",
    "talk to someone",
    "speak to someone",
  ],

  REPEAT_MENU: [
    "repeat menu",
    "repeat options",
    "say that again",
    "menu again",
  ],

  CONTINUE_AI: [
    "continue",
    "continue conversation",
    "ask question",
    "ai assistant",
  ],

  END_CALL: [
    "end call",
    "hang up",
    "goodbye",
    "bye",
    "disconnect",
  ],
};

//--------------------------------------------------
// Normalize
//--------------------------------------------------

function normalize(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

//--------------------------------------------------
// Tokens
//--------------------------------------------------

function meaningfulTokens(
  value: string
): string[] {
  return normalize(
    value
  )
    .split(
      " "
    )
    .filter(
      token =>
        token.length >= 2 &&
        !STOP_WORDS.has(
          token
        )
    );
}

//--------------------------------------------------
// Phrase Match
//--------------------------------------------------

function containsPhrase(
  transcript: string,
  phrase: string
): boolean {
  const normalizedTranscript =
    normalize(
      transcript
    );

  const normalizedPhrase =
    normalize(
      phrase
    );

  if (
    !normalizedTranscript ||
    !normalizedPhrase
  ) {
    return false;
  }

  return (
    normalizedTranscript ===
      normalizedPhrase ||
    normalizedTranscript.includes(
      normalizedPhrase
    )
  );
}

//--------------------------------------------------
// Token Score
//--------------------------------------------------

function tokenScore(
  transcript: string,
  candidate: string
): number {
  const transcriptTokens =
    new Set(
      meaningfulTokens(
        transcript
      )
    );

  const candidateTokens =
    meaningfulTokens(
      candidate
    );

  if (
    candidateTokens.length ===
    0
  ) {
    return 0;
  }

  let matches =
    0;

  for (
    const token of
    candidateTokens
  ) {
    if (
      transcriptTokens.has(
        token
      )
    ) {
      matches +=
        1;
    }
  }

  return (
    matches /
    candidateTokens.length
  );
}

//--------------------------------------------------
// Option Score
//--------------------------------------------------

function scoreOption(
  transcript: string,
  option: IVRMenuOption
): number {
  let score =
    0;

  //------------------------------------------------
  // Configured Label
  //------------------------------------------------

  if (
    containsPhrase(
      transcript,
      option.label
    )
  ) {
    score =
      Math.max(
        score,
        1
      );
  } else {
    score =
      Math.max(
        score,
        tokenScore(
          transcript,
          option.label
        ) *
          0.9
      );
  }

  //------------------------------------------------
  // Optional Configured Value
  //------------------------------------------------

  if (
    option.value
  ) {
    if (
      containsPhrase(
        transcript,
        option.value
      )
    ) {
      score =
        Math.max(
          score,
          0.95
        );
    } else {
      score =
        Math.max(
          score,
          tokenScore(
            transcript,
            option.value
          ) *
            0.85
        );
    }
  }

  //------------------------------------------------
  // Semantic Action Aliases
  //------------------------------------------------

  const aliases =
    ACTION_ALIASES[
      option.action
    ] ??
    [];

  for (
    const alias of
    aliases
  ) {
    if (
      containsPhrase(
        transcript,
        alias
      )
    ) {
      score =
        Math.max(
          score,
          alias.includes(
            " "
          )
            ? 0.95
            : 0.88
        );

      continue;
    }

    score =
      Math.max(
        score,
        tokenScore(
          transcript,
          alias
        ) *
          0.8
      );
  }

  return score;
}

//--------------------------------------------------
// Resolve Voice Input
//--------------------------------------------------

export function resolveIVRVoiceInput(
  menu: IVRRuntimeMenu,
  transcript: string
): IVRVoiceResolution {
  const normalizedTranscript =
    normalize(
      transcript
    );

  if (
    !normalizedTranscript
  ) {
    return {
      matched:
        false,

      action:
        null,

      option:
        null,

      confidence:
        0,

      reason:
        "empty_transcript",
    };
  }

  let bestOption:
    IVRMenuOption | null =
    null;

  let bestScore =
    0;

  for (
    const option of
    menu.options
  ) {
    const score =
      scoreOption(
        normalizedTranscript,
        option
      );

    if (
      score >
      bestScore
    ) {
      bestScore =
        score;

      bestOption =
        option;
    }
  }

  //------------------------------------------------
  // Conservative Threshold
  //------------------------------------------------

  if (
    !bestOption ||
    bestScore <
      0.72
  ) {
    return {
      matched:
        false,

      action:
        null,

      option:
        null,

      confidence:
        bestScore,

      reason:
        "no_confident_menu_match",
    };
  }

  return {
    matched:
      true,

    action:
      bestOption.action,

    option:
      bestOption,

    confidence:
      bestScore,

    reason:
      "published_menu_match",
  };
}