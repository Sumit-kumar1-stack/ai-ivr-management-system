type Callback = () => void;

class SilenceDetector {

  private timers =
    new Map<string, NodeJS.Timeout>();

  private readonly SILENCE_MS = 1200;

  reset(
    callId: string,
    callback: Callback
  ) {

    this.clear(callId);

    const timer = setTimeout(() => {

      callback();

    }, this.SILENCE_MS);

    this.timers.set(callId, timer);

  }

  clear(callId: string) {

    const timer =
      this.timers.get(callId);

    if (timer) {

      clearTimeout(timer);

      this.timers.delete(callId);

    }

  }

}

export const silenceDetector =
  new SilenceDetector();