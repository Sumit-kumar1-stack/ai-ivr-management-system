interface SpeechProductionEntry {
  turnId?: number;
  startedAt: number;
}

const activeProductions =
  new Map<
    string,
    SpeechProductionEntry
  >();

export const SpeechProduction = {
  begin(
    callId: string,
    turnId?: number
  ): void {
    activeProductions.set(
      callId,
      {
        turnId,
        startedAt:
          Date.now(),
      }
    );
  },

  complete(
    callId: string,
    turnId?: number
  ): void {
    const current =
      activeProductions.get(
        callId
      );

    if (!current) {
      return;
    }

    if (
      turnId !== undefined &&
      current.turnId !== undefined &&
      current.turnId !== turnId
    ) {
      return;
    }

    activeProductions.delete(
      callId
    );
  },

  isActive(
    callId: string
  ): boolean {
    return activeProductions.has(
      callId
    );
  },

  getTurnId(
    callId: string
  ): number | undefined {
    return activeProductions
      .get(
        callId
      )
      ?.turnId;
  },

  clear(
    callId: string
  ): void {
    activeProductions.delete(
      callId
    );
  },
};