type SilenceCallback = () => Promise<void> | void;

const timers = new Map<
  string,
  NodeJS.Timeout
>();

const DEFAULT_TIMEOUT = 2000;

export const SilenceDetector = {

  start(
    callId: string,
    callback: SilenceCallback,
    timeout = DEFAULT_TIMEOUT
  ) {

    this.stop(callId);

    console.log(
      `⏳ Silence timer started (${callId})`
    );

    const timer = setTimeout(async () => {

      console.log(
        `🔇 Silence detected (${callId})`
      );

      timers.delete(callId);

      try {

  await callback();

} catch (error) {

  console.error(
    "Silence callback failed:",
    error
  );

}

    }, timeout);

    timers.set(callId, timer);

  },

  reset(
    callId: string,
    callback: SilenceCallback,
    timeout = DEFAULT_TIMEOUT
  ) {

    console.log(
      `🔄 Reset silence timer (${callId})`
    );

    this.start(
      callId,
      callback,
      timeout
    );

  },

  stop(callId: string) {

    const timer =
      timers.get(callId);

    if (timer) {

      clearTimeout(timer);

      timers.delete(callId);

    }

  },

  hasTimer(callId: string) {

    return timers.has(callId);

  },

};