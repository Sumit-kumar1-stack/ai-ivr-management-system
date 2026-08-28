interface STTSession {

  callId: string;

  provider: string;

  connected: boolean;

  startedAt: number;

}

class STTSessionManagerService {

  private sessions =
    new Map<string, STTSession>();

  create(
    callId: string,
    provider: string
  ) {

    this.sessions.set(callId, {

      callId,

      provider,

      connected: true,

      startedAt: Date.now(),

    });

  }

  get(callId: string) {

    return this.sessions.get(callId);

  }

  has(callId: string) {

    return this.sessions.has(callId);

  }

  remove(callId: string) {

    this.sessions.delete(callId);

  }

  list() {

    return [...this.sessions.values()];

  }

}

export const STTSessionManager =
  new STTSessionManagerService();