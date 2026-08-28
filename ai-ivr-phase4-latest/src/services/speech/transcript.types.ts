export interface PartialTranscript {

  callId: string;

  text: string;

  isFinal: boolean;

  timestamp: number;

}

export interface FinalTranscript {

  callId: string;

  text: string;

  timestamp: number;

}