export interface LiveDashboardDto {
  activeCalls: number;
  queuedCalls: number;
  completedToday: number;
  failedToday: number;
}

export interface ActiveCallDto {
  id: string;
  providerCallId: string;
  status: string;
  createdAt: Date;
}

export interface TimelineDto {
  id: string;
  callId: string;
  type: string;
  message: string | null;
  createdAt: Date;
}