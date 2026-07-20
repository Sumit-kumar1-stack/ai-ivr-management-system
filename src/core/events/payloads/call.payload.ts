export interface CallPayload {

  callId: string;

  timestamp: Date;

  metadata?: Record<string, unknown>;

}