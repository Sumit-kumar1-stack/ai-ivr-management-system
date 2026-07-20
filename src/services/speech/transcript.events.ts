import { EventEmitter } from "events";

export const TranscriptEvents = new EventEmitter();

TranscriptEvents.setMaxListeners(100);

export const TranscriptEvent = {
  PARTIAL: "transcript.partial",
  FINAL: "transcript.final",
} as const;